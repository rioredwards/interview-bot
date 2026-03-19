import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import Anthropic from "@anthropic-ai/sdk";
import twilio from "twilio";
import { getSystemPrompt } from "./system-prompt.js";

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

// --- Anthropic client and state ---
const client = new Anthropic();

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

const conversations: Record<string, ConversationMessage[]> = {};
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

    if (!conversations[sessionId]) {
      conversations[sessionId] = [];
    }
    conversations[sessionId].push({ role: "user", content: message });

    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: systemPrompt,
        messages: conversations[sessionId],
      });

      const reply =
        response.content[0].type === "text" ? response.content[0].text : "";
      conversations[sessionId].push({ role: "assistant", content: reply });

      res.json({ reply });
    } catch (err) {
      console.error("Anthropic error:", err);
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

  if (!conversations[from]) {
    conversations[from] = [];
  }
  conversations[from].push({ role: "user", content: body });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: conversations[from],
    });

    const reply =
      response.content[0].type === "text" ? response.content[0].text : "";
    conversations[from].push({ role: "assistant", content: reply });

    twiml.message(reply.length > 1600 ? reply.slice(0, 1597) + "..." : reply);
  } catch (err) {
    console.error("Anthropic error:", err);
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
