import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  reply: string;
  provider: "anthropic" | "openai";
}

const FALLBACK_ENABLED =
  process.env.FALLBACK_ENABLED !== "false" && !!process.env.OPENAI_API_KEY;

const anthropic = new Anthropic();

const openai = FALLBACK_ENABLED
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

if (FALLBACK_ENABLED) {
  console.log("OpenAI fallback: enabled");
} else {
  console.log("OpenAI fallback: disabled (no OPENAI_API_KEY or FALLBACK_ENABLED=false)");
}

async function callAnthropic(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

async function callOpenAI(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  if (!openai) {
    throw new Error("OpenAI fallback is not configured");
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}

/**
 * Sends a chat request to Anthropic first. If Anthropic fails,
 * falls back to OpenAI. Returns the reply and which provider served it.
 */
export async function sendChat(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<ChatResult> {
  try {
    const reply = await callAnthropic(systemPrompt, messages);
    return { reply, provider: "anthropic" };
  } catch (err) {
    console.error("Anthropic error:", err);

    if (!FALLBACK_ENABLED || !openai) {
      throw err;
    }

    console.log("Falling back to OpenAI...");
    try {
      const reply = await callOpenAI(systemPrompt, messages);
      return { reply, provider: "openai" };
    } catch (openaiErr) {
      console.error("OpenAI fallback error:", openaiErr);
      throw openaiErr;
    }
  }
}
