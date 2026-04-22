import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock both SDKs before importing chat-provider
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn();
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
    __mockCreate: mockCreate,
  };
});

vi.mock("openai", () => {
  const mockCreate = vi.fn();
  return {
    default: class MockOpenAI {
      chat = { completions: { create: mockCreate } };
    },
    __mockCreate: mockCreate,
  };
});

// Set env before importing (module reads env at import time)
process.env.OPENAI_API_KEY = "test-key";
process.env.FALLBACK_ENABLED = "true";

const { sendChat, isProviderTimeoutError } = await import("../chat-provider.js");
const anthropicModule = await import("@anthropic-ai/sdk");
const openaiModule = await import("openai");

const anthropicCreate = (anthropicModule as unknown as { __mockCreate: ReturnType<typeof vi.fn> }).__mockCreate;
const openaiCreate = (openaiModule as unknown as { __mockCreate: ReturnType<typeof vi.fn> }).__mockCreate;

describe("chat-provider", () => {
  beforeEach(() => {
    anthropicCreate.mockReset();
    openaiCreate.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const systemPrompt = "You are a test bot.";
  const messages = [{ role: "user" as const, content: "hello" }];

  describe("Anthropic success", () => {
    it("returns reply with provider 'anthropic'", async () => {
      anthropicCreate.mockResolvedValue({
        content: [{ type: "text", text: "Hello from Claude" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await sendChat(systemPrompt, messages);
      expect(result.reply).toBe("Hello from Claude");
      expect(result.provider).toBe("anthropic");
    });

    it("returns token usage", async () => {
      anthropicCreate.mockResolvedValue({
        content: [{ type: "text", text: "reply" }],
        usage: { input_tokens: 200, output_tokens: 75 },
      });

      const result = await sendChat(systemPrompt, messages);
      expect(result.tokens).toEqual({
        inputTokens: 200,
        outputTokens: 75,
      });
    });

    it("does not call OpenAI when Anthropic succeeds", async () => {
      anthropicCreate.mockResolvedValue({
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await sendChat(systemPrompt, messages);
      expect(openaiCreate).not.toHaveBeenCalled();
    });

    it("passes correct parameters to Anthropic", async () => {
      anthropicCreate.mockResolvedValue({
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await sendChat(systemPrompt, messages);
      expect(anthropicCreate).toHaveBeenCalledWith({
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
      });
    });
  });

  describe("Anthropic failure with OpenAI fallback", () => {
    it("falls back to OpenAI and returns provider 'openai'", async () => {
      anthropicCreate.mockRejectedValue(new Error("Anthropic down"));
      openaiCreate.mockResolvedValue({
        choices: [{ message: { content: "Hello from GPT" } }],
        usage: { prompt_tokens: 150, completion_tokens: 60 },
      });

      const result = await sendChat(systemPrompt, messages);
      expect(result.reply).toBe("Hello from GPT");
      expect(result.provider).toBe("openai");
    });

    it("returns OpenAI token usage on fallback", async () => {
      anthropicCreate.mockRejectedValue(new Error("fail"));
      openaiCreate.mockResolvedValue({
        choices: [{ message: { content: "reply" } }],
        usage: { prompt_tokens: 300, completion_tokens: 100 },
      });

      const result = await sendChat(systemPrompt, messages);
      expect(result.tokens).toEqual({
        inputTokens: 300,
        outputTokens: 100,
      });
    });

    it("prepends system message for OpenAI", async () => {
      anthropicCreate.mockRejectedValue(new Error("fail"));
      openaiCreate.mockResolvedValue({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await sendChat(systemPrompt, messages);
      expect(openaiCreate).toHaveBeenCalledWith({
        model: "gpt-4o",
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      });
    });
  });

  describe("both providers fail", () => {
    it("throws the OpenAI error", async () => {
      anthropicCreate.mockRejectedValue(new Error("Anthropic down"));
      openaiCreate.mockRejectedValue(new Error("OpenAI also down"));

      await expect(sendChat(systemPrompt, messages)).rejects.toThrow(
        "OpenAI also down",
      );
    });
  });

  describe("edge cases", () => {
    it("returns empty string for non-text content blocks", async () => {
      anthropicCreate.mockResolvedValue({
        content: [{ type: "tool_use", id: "123" }],
        usage: { input_tokens: 10, output_tokens: 0 },
      });

      const result = await sendChat(systemPrompt, messages);
      expect(result.reply).toBe("");
    });

    it("handles missing OpenAI usage gracefully", async () => {
      anthropicCreate.mockRejectedValue(new Error("fail"));
      openaiCreate.mockResolvedValue({
        choices: [{ message: { content: "reply" } }],
        // No usage field
      });

      const result = await sendChat(systemPrompt, messages);
      expect(result.tokens).toBeUndefined();
    });

    it("returns ProviderTimeoutError when both providers time out", async () => {
      vi.useFakeTimers();
      try {
        anthropicCreate.mockImplementation(() => new Promise(() => {}));
        openaiCreate.mockImplementation(() => new Promise(() => {}));

        const assertion = expect(
          sendChat(systemPrompt, messages),
        ).rejects.toSatisfy((error: unknown) => isProviderTimeoutError(error));

        await vi.advanceTimersByTimeAsync(30010);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
