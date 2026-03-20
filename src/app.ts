import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import rateLimit, { type Store as RateLimitStore } from "express-rate-limit";
import helmet from "helmet";
import crypto from "crypto";
import { RedisStore } from "rate-limit-redis";
import { createClient } from "redis";
import twilio from "twilio";
import { getSystemPrompt } from "./system-prompt.js";
import {
  isProviderTimeoutError,
  sendChat,
  type ChatMessage,
} from "./chat-provider.js";
import { matchFaq } from "./faq-router.js";
import { logRequest, logRateLimit } from "./logger.js";
import { loadConfig } from "./config.js";
import { chatRequestSchema, smsRequestSchema } from "./schemas.js";

function withLocalDevOrigins(allowlist: string[], nodeEnv: string): string[] {
  if (nodeEnv === "production") {
    return allowlist;
  }

  const localOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];

  if (allowlist.length > 0) {
    const hasAnyLocalOrigin = allowlist.some((origin) =>
      localOrigins.includes(origin),
    );
    if (!hasAnyLocalOrigin) {
      console.warn(
        "CORS_ALLOWED_ORIGINS does not include localhost. " +
          "Allowing localhost origins automatically in non-production mode.",
      );
    }
  }

  return [...new Set([...allowlist, ...localOrigins])];
}

interface ConversationSession {
  messages: ChatMessage[];
  lastActivityAt: number;
}

interface RequestWithRequestId extends Request {
  requestId?: string;
}

function sanitizeSessionId(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > maxLength) {
    return null;
  }

  return trimmed;
}

function getRequestId(req: Request): string {
  return (req as RequestWithRequestId).requestId ?? "unknown";
}

async function connectRedisWithTimeout(url: string, timeoutMs: number) {
  const client = createClient({ url });

  let redisErrorLogged = false;
  client.on("error", (error) => {
    if (redisErrorLogged) {
      return;
    }
    redisErrorLogged = true;

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unknown Redis client error";
    console.warn(
      `Redis rate limiter unavailable (${message}). Falling back to in-memory rate limiting. ` +
        "This is expected in local development unless Redis is running.",
    );
  });

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Redis connection timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
    return client;
  } catch (error) {
    client.destroy();
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function createRedisStore(client: ReturnType<typeof createClient>, prefix: string) {
  return new RedisStore({
    sendCommand: (...args: string[]) => client.sendCommand(args),
    prefix,
  });
}

export async function createApp() {
  const config = loadConfig();
  const app = express();
  const allowedOrigins = withLocalDevOrigins(
    config.CORS_ALLOWED_ORIGINS,
    config.NODE_ENV,
  );

  app.set("trust proxy", config.TRUST_PROXY);
  app.use(helmet());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header("x-request-id");
    const requestId =
      typeof incoming === "string" && incoming.trim() !== ""
        ? incoming.trim()
        : crypto.randomUUID();
    (req as RequestWithRequestId).requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowedOrigins.length === 0) {
          callback(new Error("CORS_NOT_ALLOWED"));
          return;
        }

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("CORS_NOT_ALLOWED"));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: config.MAX_REQUEST_BODY_BYTES }));
  app.use(
    express.urlencoded({
      extended: false,
      limit: config.MAX_REQUEST_BODY_BYTES,
    }),
  );

  // --- Rate limiting configuration ---
  const rateLimitMessage = {
    error:
      "You've sent a lot of messages recently. Please wait a bit before trying again.",
  };

  let ipRateLimitStore: RateLimitStore | undefined;
  let sessionRateLimitStore: RateLimitStore | undefined;
  if (config.REDIS_URL) {
    try {
      const redisClient = await connectRedisWithTimeout(
        config.REDIS_URL,
        config.REDIS_CONNECT_TIMEOUT_MS,
      );
      ipRateLimitStore = createRedisStore(redisClient, "rl:ip:");
      sessionRateLimitStore = createRedisStore(redisClient, "rl:session:");
      console.log("Rate limiting store: redis");
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Unknown connection error";
      console.warn(
        `Redis unavailable for rate limiting (${message}). Falling back to in-memory store. ` +
          "This is expected in local development unless Redis is running.",
      );
    }
  } else {
    console.log("Rate limiting store: memory (REDIS_URL not set)");
  }

  const ipLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_IP_WINDOW_MS,
    max: config.RATE_LIMIT_IP_MAX,
    store: ipRateLimitStore,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage,
    handler: (req: Request, res: Response) => {
      const sessionId = sanitizeSessionId(
        (req.body as { sessionId?: unknown })?.sessionId,
        config.MAX_SESSION_ID_LENGTH,
      );
      logRateLimit({
        requestId: getRequestId(req),
        ip: req.ip ?? "unknown",
        limiter: "ip",
        sessionId: sessionId ?? undefined,
      });
      res.status(429).json(rateLimitMessage);
    },
  });

  const sessionLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_SESSION_WINDOW_MS,
    max: config.RATE_LIMIT_SESSION_MAX,
    store: sessionRateLimitStore,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const sessionId = sanitizeSessionId(
        (req.body as { sessionId?: unknown })?.sessionId,
        config.MAX_SESSION_ID_LENGTH,
      );
      return sessionId ?? "unknown";
    },
    message: rateLimitMessage,
    validate: false,
    handler: (req: Request, res: Response) => {
      const sessionId = sanitizeSessionId(
        (req.body as { sessionId?: unknown })?.sessionId,
        config.MAX_SESSION_ID_LENGTH,
      );
      logRateLimit({
        requestId: getRequestId(req),
        ip: req.ip ?? "unknown",
        limiter: "session",
        sessionId: sessionId ?? undefined,
      });
      res.status(429).json(rateLimitMessage);
    },
  });

  // --- Input limits ---
  /** Returns a copy of the most recent turns of conversation history, capped to MAX_HISTORY_TURNS. */
  function recentHistory(history: ChatMessage[]): ChatMessage[] {
    return history.slice(-config.MAX_HISTORY_TURNS);
  }

  // --- Conversation state ---
  const conversations = new Map<string, ConversationSession>();

  function trimStoredMessages(session: ConversationSession): void {
    if (session.messages.length <= config.MAX_STORED_MESSAGES) {
      return;
    }
    session.messages = session.messages.slice(-config.MAX_STORED_MESSAGES);
  }

  function evictOldestSessionIfNeeded(): void {
    if (conversations.size < config.MAX_ACTIVE_SESSIONS) {
      return;
    }

    let oldestSessionId: string | null = null;
    let oldestTimestamp = Number.POSITIVE_INFINITY;

    for (const [sessionId, session] of conversations.entries()) {
      if (session.lastActivityAt < oldestTimestamp) {
        oldestTimestamp = session.lastActivityAt;
        oldestSessionId = sessionId;
      }
    }

    if (oldestSessionId) {
      conversations.delete(oldestSessionId);
    }
  }

  function isExpired(session: ConversationSession, now: number): boolean {
    return now - session.lastActivityAt > config.SESSION_TTL_MS;
  }

  function getSession(sessionId: string): ConversationSession {
    const now = Date.now();
    const existing = conversations.get(sessionId);
    if (!existing) {
      evictOldestSessionIfNeeded();
      const created = { messages: [], lastActivityAt: now };
      conversations.set(sessionId, created);
      return created;
    }

    if (isExpired(existing, now)) {
      const refreshed = { messages: [], lastActivityAt: now };
      conversations.set(sessionId, refreshed);
      return refreshed;
    }

    existing.lastActivityAt = now;
    return existing;
  }

  function cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of conversations.entries()) {
      if (isExpired(session, now)) {
        conversations.delete(sessionId);
      }
    }
  }

  const cleanupTimer = setInterval(
    cleanupExpiredSessions,
    config.SESSION_CLEANUP_INTERVAL_MS,
  );
  cleanupTimer.unref?.();

  const systemPrompt = getSystemPrompt();

  // --- Web chat endpoint ---
  app.post(
    "/chat",
    ipLimiter,
    sessionLimiter,
    async (req: Request, res: Response) => {
      const parsed = chatRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({ error: "message and sessionId are required" });
        return;
      }

      const { message, sessionId } = parsed.data;
      const normalizedSessionId = sanitizeSessionId(
        sessionId,
        config.MAX_SESSION_ID_LENGTH,
      );

      if (!normalizedSessionId || message === "") {
        res.status(400).json({ error: "message and sessionId are required" });
        return;
      }

      if (message.length > config.MAX_MESSAGE_LENGTH) {
        res.status(400).json({
          error: `Message is too long. Please keep it under ${config.MAX_MESSAGE_LENGTH} characters.`,
        });
        return;
      }

      const session = getSession(normalizedSessionId);
      session.messages.push({ role: "user", content: message });
      trimStoredMessages(session);

      const start = Date.now();

      // Try FAQ cache before calling the LLM
      const faq = matchFaq(message);
      if (faq) {
        session.messages.push({
          role: "assistant",
          content: faq.reply,
        });
        trimStoredMessages(session);
        logRequest({
          event: "chat_request",
          requestId: getRequestId(req),
          sessionId: normalizedSessionId,
          ip: req.ip ?? "unknown",
          provider: "faq",
          faqIntent: faq.intent,
          durationMs: Date.now() - start,
        });
        res.json({ reply: faq.reply });
        return;
      }

      try {
        const { reply, provider, tokens } = await sendChat(
          systemPrompt,
          recentHistory(session.messages),
        );
        session.messages.push({ role: "assistant", content: reply });
        trimStoredMessages(session);
        logRequest({
          event: "chat_request",
          requestId: getRequestId(req),
          sessionId: normalizedSessionId,
          ip: req.ip ?? "unknown",
          provider,
          tokens,
          durationMs: Date.now() - start,
        });
        res.json({ reply });
      } catch (err) {
        if (isProviderTimeoutError(err)) {
          res.status(504).json({
            error:
              "I'm taking too long to respond right now. Please try again in a moment.",
          });
          return;
        }

        console.error("All providers failed:", err);
        res
          .status(500)
          .json({ error: "Something went wrong. Please try again." });
      }
    },
  );

  // --- SMS endpoint (Twilio) ---
  if (config.ENABLE_TWILIO_SMS) {
    app.post("/sms", async (req: Request, res: Response) => {
      const twiml = new twilio.twiml.MessagingResponse();
      const parsed = smsRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        twiml.message("Sorry, I didn't catch that.");
        res.type("text/xml").send(twiml.toString());
        return;
      }

      const { From: from, Body: body } = parsed.data;

      if (!from || !body) {
        twiml.message("Sorry, I didn't catch that.");
        res.type("text/xml").send(twiml.toString());
        return;
      }

      if (body.length > config.MAX_MESSAGE_LENGTH) {
        twiml.message(
          `Message is too long. Please keep it under ${config.MAX_MESSAGE_LENGTH} characters.`,
        );
        res.type("text/xml").send(twiml.toString());
        return;
      }

      const session = getSession(from);
      session.messages.push({ role: "user", content: body });
      trimStoredMessages(session);

      const start = Date.now();

      // Try FAQ cache before calling the LLM
      const faq = matchFaq(body);
      if (faq) {
        session.messages.push({ role: "assistant", content: faq.reply });
        trimStoredMessages(session);
        logRequest({
          event: "sms_request",
          requestId: getRequestId(req),
          sessionId: from,
          ip: req.ip ?? "unknown",
          provider: "faq",
          faqIntent: faq.intent,
          durationMs: Date.now() - start,
        });
        twiml.message(
          faq.reply.length > 1600
            ? faq.reply.slice(0, 1597) + "..."
            : faq.reply,
        );
        res.type("text/xml").send(twiml.toString());
        return;
      }

      try {
        const { reply, provider, tokens } = await sendChat(
          systemPrompt,
          recentHistory(session.messages),
        );
        session.messages.push({ role: "assistant", content: reply });
        trimStoredMessages(session);
        logRequest({
          event: "sms_request",
          requestId: getRequestId(req),
          sessionId: from,
          ip: req.ip ?? "unknown",
          provider,
          tokens,
          durationMs: Date.now() - start,
        });
        twiml.message(
          reply.length > 1600 ? reply.slice(0, 1597) + "..." : reply,
        );
      } catch (err) {
        if (isProviderTimeoutError(err)) {
          twiml.message(
            "I'm taking a bit longer than expected. Please try again in a moment.",
          );
          res.type("text/xml").send(twiml.toString());
          return;
        }

        console.error("All providers failed:", err);
        twiml.message("Something went wrong. Please try again.");
      }

      res.type("text/xml").send(twiml.toString());
    });
  } else {
    app.post("/sms", (_req: Request, res: Response) => {
      res.status(404).send("Not found");
    });
  }

  // Health check
  app.get("/health", (_: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.use((err: Error, _: Request, res: Response, next: NextFunction) => {
    const maybeHttpError = err as Error & { status?: number; type?: string };
    if (
      maybeHttpError.status === 413 ||
      maybeHttpError.type === "entity.too.large"
    ) {
      res.status(413).json({
        error: `Request body is too large. Keep it under ${config.MAX_REQUEST_BODY_BYTES} bytes.`,
      });
      return;
    }

    if (err.message === "CORS_NOT_ALLOWED") {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    next();
  });

  return app;
}
