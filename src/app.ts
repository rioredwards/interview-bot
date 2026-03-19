import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import rateLimit, { type Store as RateLimitStore } from "express-rate-limit";
import helmet from "helmet";
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

function parseAllowlist(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseTrustProxy(value: string | undefined): boolean | number {
  if (!value || value.trim() === "") {
    return process.env.NODE_ENV === "production" ? 1 : false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;

  const numeric = Number.parseInt(normalized, 10);
  if (!Number.isNaN(numeric) && numeric >= 0) {
    return numeric;
  }

  return process.env.NODE_ENV === "production" ? 1 : false;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

interface ConversationSession {
  messages: ChatMessage[];
  lastActivityAt: number;
}

async function connectRedisWithTimeout(url: string, timeoutMs: number) {
  const client = createClient({ url });

  client.on("error", (error) => {
    console.error("Redis rate limiter client error:", error);
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
  const app = express();
  const allowedOrigins = parseAllowlist(process.env.CORS_ALLOWED_ORIGINS);
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  const SESSION_TTL_MS = parsePositiveInt(
    process.env.SESSION_TTL_MS,
    24 * 60 * 60 * 1000,
  );
  const SESSION_CLEANUP_INTERVAL_MS = parsePositiveInt(
    process.env.SESSION_CLEANUP_INTERVAL_MS,
    5 * 60 * 1000,
  );
  const REDIS_CONNECT_TIMEOUT_MS = parsePositiveInt(
    process.env.REDIS_CONNECT_TIMEOUT_MS,
    2000,
  );
  const REDIS_URL = process.env.REDIS_URL?.trim();

  app.set("trust proxy", trustProxy);
  app.use(helmet());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowedOrigins.length === 0) {
          if (
            origin.startsWith("http://localhost:") ||
            origin.startsWith("http://127.0.0.1:")
          ) {
            callback(null, true);
            return;
          }
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
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // --- Rate limiting configuration ---
  const RATE_LIMIT_IP_MAX =
    parseInt(process.env.RATE_LIMIT_IP_MAX ?? "", 10) || 30;
  const RATE_LIMIT_IP_WINDOW_MS =
    parseInt(process.env.RATE_LIMIT_IP_WINDOW_MS ?? "", 10) || 60 * 60 * 1000;
  const RATE_LIMIT_SESSION_MAX =
    parseInt(process.env.RATE_LIMIT_SESSION_MAX ?? "", 10) || 20;
  const RATE_LIMIT_SESSION_WINDOW_MS =
    parseInt(process.env.RATE_LIMIT_SESSION_WINDOW_MS ?? "", 10) ||
    60 * 60 * 1000;

  const rateLimitMessage = {
    error:
      "You've sent a lot of messages recently. Please wait a bit before trying again.",
  };

  let ipRateLimitStore: RateLimitStore | undefined;
  let sessionRateLimitStore: RateLimitStore | undefined;
  if (REDIS_URL) {
    try {
      const redisClient = await connectRedisWithTimeout(
        REDIS_URL,
        REDIS_CONNECT_TIMEOUT_MS,
      );
      ipRateLimitStore = createRedisStore(redisClient, "rl:ip:");
      sessionRateLimitStore = createRedisStore(redisClient, "rl:session:");
      console.log("Rate limiting store: redis");
    } catch (error) {
      console.error(
        "Redis unavailable for rate limiting. Falling back to in-memory store.",
        error,
      );
    }
  } else {
    console.log("Rate limiting store: memory (REDIS_URL not set)");
  }

  const ipLimiter = rateLimit({
    windowMs: RATE_LIMIT_IP_WINDOW_MS,
    max: RATE_LIMIT_IP_MAX,
    store: ipRateLimitStore,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage,
    handler: (req: Request, res: Response) => {
      logRateLimit({
        ip: req.ip ?? "unknown",
        limiter: "ip",
        sessionId: (req.body as { sessionId?: string })?.sessionId,
      });
      res.status(429).json(rateLimitMessage);
    },
  });

  const sessionLimiter = rateLimit({
    windowMs: RATE_LIMIT_SESSION_WINDOW_MS,
    max: RATE_LIMIT_SESSION_MAX,
    store: sessionRateLimitStore,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      return (req.body as { sessionId?: string })?.sessionId || "unknown";
    },
    message: rateLimitMessage,
    validate: false,
    handler: (req: Request, res: Response) => {
      logRateLimit({
        ip: req.ip ?? "unknown",
        limiter: "session",
        sessionId: (req.body as { sessionId?: string })?.sessionId,
      });
      res.status(429).json(rateLimitMessage);
    },
  });

  // --- Input limits ---
  const MAX_MESSAGE_LENGTH =
    parseInt(process.env.MAX_MESSAGE_LENGTH ?? "", 10) || 1000;
  const MAX_HISTORY_TURNS =
    parseInt(process.env.MAX_HISTORY_TURNS ?? "", 10) || 20;

  /** Returns a copy of the most recent turns of conversation history, capped to MAX_HISTORY_TURNS. */
  function recentHistory(history: ChatMessage[]): ChatMessage[] {
    return history.slice(-MAX_HISTORY_TURNS);
  }

  // --- Conversation state ---
  const conversations: Record<string, ConversationSession> = {};

  function isExpired(session: ConversationSession, now: number): boolean {
    return now - session.lastActivityAt > SESSION_TTL_MS;
  }

  function getSession(sessionId: string): ConversationSession {
    const now = Date.now();
    const existing = conversations[sessionId];
    if (!existing || isExpired(existing, now)) {
      conversations[sessionId] = { messages: [], lastActivityAt: now };
      return conversations[sessionId];
    }

    existing.lastActivityAt = now;
    return existing;
  }

  function cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of Object.entries(conversations)) {
      if (isExpired(session, now)) {
        delete conversations[sessionId];
      }
    }
  }

  const cleanupTimer = setInterval(
    cleanupExpiredSessions,
    SESSION_CLEANUP_INTERVAL_MS,
  );
  cleanupTimer.unref?.();

  const systemPrompt = getSystemPrompt();

  // --- Web chat endpoint ---
  app.post(
    "/chat",
    ipLimiter,
    sessionLimiter,
    async (req: Request, res: Response) => {
      const { message, sessionId } = req.body as {
        message?: string;
        sessionId?: string;
      };

      if (!message || !sessionId) {
        res.status(400).json({ error: "message and sessionId are required" });
        return;
      }

      if (message.length > MAX_MESSAGE_LENGTH) {
        res.status(400).json({
          error: `Message is too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`,
        });
        return;
      }

      const session = getSession(sessionId);
      session.messages.push({ role: "user", content: message });

      const start = Date.now();

      // Try FAQ cache before calling the LLM
      const faq = matchFaq(message);
      if (faq) {
        session.messages.push({
          role: "assistant",
          content: faq.reply,
        });
        logRequest({
          event: "chat_request",
          sessionId,
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
        logRequest({
          event: "chat_request",
          sessionId,
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
  app.post("/sms", async (req: Request, res: Response) => {
    const twiml = new twilio.twiml.MessagingResponse();
    const from = (req.body as { From?: string }).From;
    const body = (req.body as { Body?: string }).Body?.trim();

    if (!from || !body) {
      twiml.message("Sorry, I didn't catch that.");
      res.type("text/xml").send(twiml.toString());
      return;
    }

    if (body.length > MAX_MESSAGE_LENGTH) {
      twiml.message(
        `Message is too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`,
      );
      res.type("text/xml").send(twiml.toString());
      return;
    }

    const session = getSession(from);
    session.messages.push({ role: "user", content: body });

    const start = Date.now();

    // Try FAQ cache before calling the LLM
    const faq = matchFaq(body);
    if (faq) {
      session.messages.push({ role: "assistant", content: faq.reply });
      logRequest({
        event: "sms_request",
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
      logRequest({
        event: "sms_request",
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

  // Health check
  app.get("/health", (_: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.use((err: Error, _: Request, res: Response, next: NextFunction) => {
    if (err.message === "CORS_NOT_ALLOWED") {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    next();
  });

  return app;
}
