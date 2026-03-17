import "dotenv/config";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import twilio from "twilio";
import { getSystemPrompt } from "./system-prompt.js";

const app = express();
app.use(cors({
  origin: true, // reflect request origin
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const client = new Anthropic();

// In-memory conversation history keyed by sessionId or phone number
const conversations = {};

const systemPrompt = getSystemPrompt();

// --- Web chat endpoint ---
app.post("/chat", async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || !sessionId) {
    return res.status(400).json({ error: "message and sessionId are required" });
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

    const reply = response.content[0].text;
    conversations[sessionId].push({ role: "assistant", content: reply });

    res.json({ reply });
  } catch (err) {
    console.error("Anthropic error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// --- SMS endpoint (Twilio) ---
app.post("/sms", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const from = req.body.From;
  const body = req.body.Body?.trim();

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

    const reply = response.content[0].text;
    conversations[from].push({ role: "assistant", content: reply });

    twiml.message(reply.length > 1600 ? reply.slice(0, 1597) + "..." : reply);
  } catch (err) {
    console.error("Anthropic error:", err);
    twiml.message("Something went wrong. Please try again.");
  }

  res.type("text/xml").send(twiml.toString());
});

// Health check
app.get("/health", (_, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => console.log(`Interview bot listening on port ${PORT}`));
