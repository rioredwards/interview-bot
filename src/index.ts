import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import twilio from "twilio";
import { getSystemPrompt } from "./system-prompt.js";
import { sendChat, type ChatMessage } from "./chat-provider.js";
import { matchFaq } from "./faq-router.js";

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --- Rate limiting configuration ---
const RATE_LIMIT_IP_MAX = parseInt(process.env.RATE_LIMIT_IP_MAX ?? "", 10) || 30;
const RATE_LIMIT_IP_WINDOW_MS =
  parseInt(process.env.RATE_LIMIT_IP_WINDOW_MS ?? "", 10) || 60 * 60 * 1000;
const RATE_LIMIT_SESSION_MAX =
  parseInt(process.env.RATE_LIMIT_SESSION_MAX ?? "", 10) || 20;
const RATE_LIMIT_SESSION_WINDOW_MS =
  parseInt(process.env.RATE_LIMIT_SESSION_WINDOW_MS ?? "", 10) || 60 * 60 * 1000;

const rateLimitMessage = {
  error:
    "You've sent a lot of messages recently. Please wait a bit before trying again.",
};

const ipLimiter = rateLimit({
  windowMs: RATE_LIMIT_IP_WINDOW_MS,
  max: RATE_LIMIT_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
});

const sessionLimiter = rateLimit({
  windowMs: RATE_LIMIT_SESSION_WINDOW_MS,
  max: RATE_LIMIT_SESSION_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return (req.body as { sessionId?: string })?.sessionId || "unknown";
  },
  message: rateLimitMessage,
  validate: false,
});

// --- Input limits ---
const MAX_MESSAGE_LENGTH =
  parseInt(process.env.MAX_MESSAGE_LENGTH ?? "", 10) || 1000;
const MAX_HISTORY_TURNS =
  parseInt(process.env.MAX_HISTORY_TURNS ?? "", 10) || 20;

/** Returns the most recent turns of conversation history, capped to MAX_HISTORY_TURNS. */
function recentHistory(history: ChatMessage[]): ChatMessage[] {
  if (history.length <= MAX_HISTORY_TURNS) return history;
  return history.slice(-MAX_HISTORY_TURNS);
}

// --- Conversation state ---
const conversations: Record<string, ChatMessage[]> = {};
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

    if (!conversations[sessionId]) {
      conversations[sessionId] = [];
    }
    conversations[sessionId].push({ role: "user", content: message });

    // Try FAQ cache before calling the LLM
    const faq = matchFaq(message);
    if (faq) {
      console.log(`Chat response served by: faq (${faq.intent})`);
      conversations[sessionId].push({ role: "assistant", content: faq.reply });
      res.json({ reply: faq.reply });
      return;
    }

    try {
      const { reply, provider } = await sendChat(
        systemPrompt,
        recentHistory(conversations[sessionId]),
      );
      console.log(`Chat response served by: ${provider}`);
      conversations[sessionId].push({ role: "assistant", content: reply });

      res.json({ reply });
    } catch (err) {
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

  if (!conversations[from]) {
    conversations[from] = [];
  }
  conversations[from].push({ role: "user", content: body });

  // Try FAQ cache before calling the LLM
  const faq = matchFaq(body);
  if (faq) {
    console.log(`SMS response served by: faq (${faq.intent})`);
    conversations[from].push({ role: "assistant", content: faq.reply });
    twiml.message(
      faq.reply.length > 1600 ? faq.reply.slice(0, 1597) + "..." : faq.reply,
    );
    res.type("text/xml").send(twiml.toString());
    return;
  }

  try {
    const { reply, provider } = await sendChat(
      systemPrompt,
      recentHistory(conversations[from]),
    );
    console.log(`SMS response served by: ${provider}`);
    conversations[from].push({ role: "assistant", content: reply });

    twiml.message(reply.length > 1600 ? reply.slice(0, 1597) + "..." : reply);
  } catch (err) {
    console.error("All providers failed:", err);
    twiml.message("Something went wrong. Please try again.");
  }

  res.type("text/xml").send(twiml.toString());
});

// Health check
app.get("/health", (_: Request, res: Response) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => console.log(`Interview bot listening on port ${PORT}`));
