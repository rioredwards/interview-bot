import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { loadConfig } from "./config.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface ChatResult {
  reply: string;
  provider: "anthropic" | "openai";
  tokens?: TokenUsage;
}

export class ProviderTimeoutError extends Error {
  provider: "anthropic" | "openai";

  constructor(provider: "anthropic" | "openai", timeoutMs: number) {
    super(`Provider '${provider}' timed out after ${timeoutMs}ms`);
    this.name = "ProviderTimeoutError";
    this.provider = provider;
  }
}

export function isProviderTimeoutError(error: unknown): boolean {
  return error instanceof ProviderTimeoutError;
}

const config = loadConfig();

const PROVIDER_TIMEOUT_MS = config.PROVIDER_TIMEOUT_MS;
const FALLBACK_ENABLED = config.FALLBACK_ENABLED;

const anthropic = new Anthropic();

const openai = FALLBACK_ENABLED
  ? new OpenAI({ apiKey: config.OPENAI_API_KEY })
  : null;

if (FALLBACK_ENABLED) {
  console.log("OpenAI fallback: enabled");
} else {
  console.log("OpenAI fallback: disabled (no OPENAI_API_KEY or FALLBACK_ENABLED=false)");
}

interface ProviderResult {
  reply: string;
  tokens?: TokenUsage;
}

async function withTimeout<T>(
  promise: Promise<T>,
  provider: "anthropic" | "openai",
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new ProviderTimeoutError(provider, PROVIDER_TIMEOUT_MS));
        }, PROVIDER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function callAnthropic(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<ProviderResult> {
  const response = await withTimeout(
    anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    }),
    "anthropic",
  );

  const reply =
    response.content[0].type === "text" ? response.content[0].text : "";
  const tokens: TokenUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? undefined,
    cacheReadInputTokens: response.usage.cache_read_input_tokens ?? undefined,
  };
  return { reply, tokens };
}

async function callOpenAI(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<ProviderResult> {
  if (!openai) {
    throw new Error("OpenAI fallback is not configured");
  }

  const response = await withTimeout(
    openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
    "openai",
  );

  const reply = response.choices[0]?.message?.content ?? "";
  const tokens: TokenUsage | undefined = response.usage
    ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      }
    : undefined;
  return { reply, tokens };
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
    const result = await callAnthropic(systemPrompt, messages);
    return { ...result, provider: "anthropic" };
  } catch (err) {
    console.error("Anthropic error:", err);

    if (!FALLBACK_ENABLED || !openai) {
      throw err;
    }

    console.log("Falling back to OpenAI...");
    try {
      const result = await callOpenAI(systemPrompt, messages);
      return { ...result, provider: "openai" };
    } catch (openaiErr) {
      console.error("OpenAI fallback error:", openaiErr);
      throw openaiErr;
    }
  }
}
