import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Mock external dependencies before importing app
vi.mock("../chat-provider.js", () => ({
  sendChat: vi.fn(),
  ChatMessage: {},
}));

vi.mock("../faq-router.js", () => ({
  matchFaq: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  logRequest: vi.fn(),
  logRateLimit: vi.fn(),
}));

vi.mock("../system-prompt.js", () => ({
  getSystemPrompt: vi.fn().mockReturnValue("Test system prompt"),
}));

// Suppress console output during tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

const { sendChat } = await import("../chat-provider.js");
const { matchFaq } = await import("../faq-router.js");
const { logRequest, logRateLimit } = await import("../logger.js");

const mockSendChat = vi.mocked(sendChat);
const mockMatchFaq = vi.mocked(matchFaq);
const mockLogRequest = vi.mocked(logRequest);
const mockLogRateLimit = vi.mocked(logRateLimit);

// Import app after mocks are set up
const { createApp } = await import("../app.js");

describe("routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    mockSendChat.mockReset();
    mockMatchFaq.mockReset();
    mockLogRequest.mockReset();
    mockLogRateLimit.mockReset();
  });

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });
  });

  describe("CORS and proxy config", () => {
    it("allows localhost origins by default for local development", async () => {
      const res = await request(app)
        .get("/health")
        .set("Origin", "http://localhost:3000");

      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(
        "http://localhost:3000",
      );
    });

    it("rejects non-allowed origins", async () => {
      const res = await request(app)
        .get("/health")
        .set("Origin", "https://evil.example.com");

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Origin not allowed" });
    });

    it("allows configured origins from env allowlist", async () => {
      process.env.CORS_ALLOWED_ORIGINS =
        "https://rioedwards.com,https://www.rioedwards.com";
      const allowlistApp = createApp();
      delete process.env.CORS_ALLOWED_ORIGINS;

      const res = await request(allowlistApp)
        .get("/health")
        .set("Origin", "https://rioedwards.com");

      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(
        "https://rioedwards.com",
      );
    });

    it("defaults trust proxy to false outside production", () => {
      const proxyApp = createApp();
      expect(proxyApp.get("trust proxy")).toBe(false);
    });

    it("uses trust proxy in production by default", () => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      const proxyApp = createApp();
      process.env.NODE_ENV = previousNodeEnv;

      expect(proxyApp.get("trust proxy")).toBe(1);
    });

    it("supports explicit TRUST_PROXY override", () => {
      process.env.TRUST_PROXY = "2";
      const proxyApp = createApp();
      delete process.env.TRUST_PROXY;

      expect(proxyApp.get("trust proxy")).toBe(2);
    });
  });

  describe("security headers", () => {
    it("sets helmet headers on /health", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    });

    it("sets helmet headers on /chat responses", async () => {
      const res = await request(app).post("/chat").send({});

      expect(res.status).toBe(400);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    });
  });

  describe("POST /chat", () => {
    it("returns 400 when message is missing", async () => {
      const res = await request(app)
        .post("/chat")
        .send({ sessionId: "test" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("message and sessionId are required");
    });

    it("returns 400 when sessionId is missing", async () => {
      const res = await request(app)
        .post("/chat")
        .send({ message: "hello" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("message and sessionId are required");
    });

    it("returns 400 when message is too long", async () => {
      const longMessage = "x".repeat(1001);
      const res = await request(app)
        .post("/chat")
        .send({ message: longMessage, sessionId: "test" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("too long");
    });

    it("returns FAQ reply without calling LLM", async () => {
      mockMatchFaq.mockReturnValue({
        intent: "greeting",
        reply: "Hello! I'm RioBot.",
      });

      const res = await request(app)
        .post("/chat")
        .send({ message: "hi", sessionId: "faq-test" });

      expect(res.status).toBe(200);
      expect(res.body.reply).toBe("Hello! I'm RioBot.");
      expect(mockSendChat).not.toHaveBeenCalled();
    });

    it("logs FAQ hit with correct event", async () => {
      mockMatchFaq.mockReturnValue({
        intent: "greeting",
        reply: "Hello!",
      });

      await request(app)
        .post("/chat")
        .send({ message: "hi", sessionId: "log-test" });

      expect(mockLogRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "chat_request",
          sessionId: "log-test",
          provider: "faq",
          faqIntent: "greeting",
        }),
      );
    });

    it("returns LLM reply when FAQ misses", async () => {
      mockMatchFaq.mockReturnValue(null);
      mockSendChat.mockResolvedValue({
        reply: "Hello from the LLM",
        provider: "anthropic",
        tokens: { inputTokens: 100, outputTokens: 50 },
      });

      const res = await request(app)
        .post("/chat")
        .send({ message: "tell me about DogTown", sessionId: "llm-test" });

      expect(res.status).toBe(200);
      expect(res.body.reply).toBe("Hello from the LLM");
    });

    it("logs LLM hit with token usage", async () => {
      mockMatchFaq.mockReturnValue(null);
      mockSendChat.mockResolvedValue({
        reply: "reply",
        provider: "openai",
        tokens: { inputTokens: 200, outputTokens: 80 },
      });

      await request(app)
        .post("/chat")
        .send({ message: "question", sessionId: "token-test" });

      expect(mockLogRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          tokens: { inputTokens: 200, outputTokens: 80 },
        }),
      );
    });

    it("returns 500 when all providers fail", async () => {
      mockMatchFaq.mockReturnValue(null);
      mockSendChat.mockRejectedValue(new Error("All providers down"));

      const res = await request(app)
        .post("/chat")
        .set("Content-Type", "application/json")
        .send({ message: "hello", sessionId: "fail-test" });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain("Something went wrong");
    });

    it("accumulates conversation history across requests", async () => {
      // Use a dedicated app to isolate conversation state
      const historyApp = createApp();
      const sessionId = `history-${Date.now()}`;

      mockMatchFaq.mockReturnValue(null);
      mockSendChat
        .mockResolvedValueOnce({
          reply: "first reply",
          provider: "anthropic" as const,
          tokens: { inputTokens: 10, outputTokens: 5 },
        })
        .mockResolvedValueOnce({
          reply: "second reply",
          provider: "anthropic" as const,
          tokens: { inputTokens: 20, outputTokens: 10 },
        });

      await request(historyApp)
        .post("/chat")
        .set("Content-Type", "application/json")
        .send({ message: "first", sessionId });

      await request(historyApp)
        .post("/chat")
        .set("Content-Type", "application/json")
        .send({ message: "second", sessionId });

      expect(mockSendChat).toHaveBeenCalledTimes(2);

      // First call should have just the one user message
      const firstCallMessages = mockSendChat.mock.calls[0][1];
      expect(firstCallMessages).toHaveLength(1);
      expect(firstCallMessages[0]).toEqual({
        role: "user",
        content: "first",
      });

      // Second call should include prior history + new message
      const secondCallMessages = mockSendChat.mock.calls[1][1];
      expect(secondCallMessages).toHaveLength(3);
      expect(secondCallMessages[0]).toEqual({
        role: "user",
        content: "first",
      });
      expect(secondCallMessages[1]).toEqual({
        role: "assistant",
        content: "first reply",
      });
      expect(secondCallMessages[2]).toEqual({
        role: "user",
        content: "second",
      });
    });

    it("expires stale sessions after inactivity TTL", async () => {
      process.env.SESSION_TTL_MS = "1";
      const ttlApp = createApp();
      delete process.env.SESSION_TTL_MS;

      const sessionId = `ttl-${Date.now()}`;
      mockMatchFaq.mockReturnValue(null);
      mockSendChat
        .mockResolvedValueOnce({
          reply: "first reply",
          provider: "anthropic" as const,
          tokens: { inputTokens: 10, outputTokens: 5 },
        })
        .mockResolvedValueOnce({
          reply: "second reply",
          provider: "anthropic" as const,
          tokens: { inputTokens: 10, outputTokens: 5 },
        });

      await request(ttlApp)
        .post("/chat")
        .set("Content-Type", "application/json")
        .send({ message: "first", sessionId });

      await new Promise((resolve) => setTimeout(resolve, 5));

      await request(ttlApp)
        .post("/chat")
        .set("Content-Type", "application/json")
        .send({ message: "second", sessionId });

      expect(mockSendChat).toHaveBeenCalledTimes(2);
      const secondCallMessages = mockSendChat.mock.calls[1][1];
      expect(secondCallMessages).toHaveLength(1);
      expect(secondCallMessages[0]).toEqual({
        role: "user",
        content: "second",
      });
    });
  });

  describe("POST /sms", () => {
    it("returns TwiML error for missing From", async () => {
      const res = await request(app)
        .post("/sms")
        .type("form")
        .send({ Body: "hello" });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/xml");
      expect(res.text).toContain("Sorry, I didn't catch that.");
    });

    it("returns TwiML error for missing Body", async () => {
      const res = await request(app)
        .post("/sms")
        .type("form")
        .send({ From: "+15551234567" });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/xml");
      expect(res.text).toContain("Sorry, I didn't catch that.");
    });

    it("returns TwiML error for oversized message", async () => {
      const res = await request(app)
        .post("/sms")
        .type("form")
        .send({ From: "+15551234567", Body: "x".repeat(1001) });

      expect(res.status).toBe(200);
      expect(res.text).toContain("too long");
    });

    it("returns FAQ reply as TwiML", async () => {
      mockMatchFaq.mockReturnValue({
        intent: "contact",
        reply: "Email: test@example.com",
      });

      const res = await request(app)
        .post("/sms")
        .type("form")
        .send({ From: "+15551234567", Body: "contact info" });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/xml");
      expect(res.text).toContain("Email: test@example.com");
      expect(mockSendChat).not.toHaveBeenCalled();
    });

    it("returns LLM reply as TwiML when FAQ misses", async () => {
      mockMatchFaq.mockReturnValue(null);
      mockSendChat.mockResolvedValue({
        reply: "LLM response here",
        provider: "anthropic",
        tokens: { inputTokens: 50, outputTokens: 25 },
      });

      const res = await request(app)
        .post("/sms")
        .type("form")
        .send({ From: "+15551234567", Body: "complex question" });

      expect(res.status).toBe(200);
      expect(res.text).toContain("LLM response here");
    });

    it("returns TwiML error when providers fail", async () => {
      mockMatchFaq.mockReturnValue(null);
      mockSendChat.mockRejectedValue(new Error("fail"));

      const res = await request(app)
        .post("/sms")
        .type("form")
        .send({ From: "+15551234567", Body: "hello" });

      expect(res.status).toBe(200);
      expect(res.text).toContain("Something went wrong");
    });

    it("truncates long replies to 1600 chars", async () => {
      mockMatchFaq.mockReturnValue(null);
      mockSendChat.mockResolvedValue({
        reply: "x".repeat(2000),
        provider: "anthropic",
        tokens: { inputTokens: 10, outputTokens: 10 },
      });

      const res = await request(app)
        .post("/sms")
        .type("form")
        .send({ From: "+15551234567", Body: "long answer please" });

      // The reply in the TwiML should be truncated
      expect(res.text).toContain("...");
      // The full 2000-char string should not be in the response
      expect(res.text).not.toContain("x".repeat(2000));
    });

    it("logs SMS requests", async () => {
      mockMatchFaq.mockReturnValue(null);
      mockSendChat.mockResolvedValue({
        reply: "reply",
        provider: "openai",
        tokens: { inputTokens: 10, outputTokens: 5 },
      });

      await request(app)
        .post("/sms")
        .type("form")
        .send({ From: "+15551234567", Body: "hello" });

      expect(mockLogRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "sms_request",
          sessionId: "+15551234567",
          provider: "openai",
        }),
      );
    });
  });

  describe("rate limiting", () => {
    it("returns 429 after exceeding session limit", async () => {
      // Create app with very low session limit
      process.env.RATE_LIMIT_SESSION_MAX = "1";
      const limitedApp = createApp();
      delete process.env.RATE_LIMIT_SESSION_MAX;

      mockMatchFaq.mockReturnValue({
        intent: "greeting",
        reply: "hi",
      });

      // First request should succeed
      const res1 = await request(limitedApp)
        .post("/chat")
        .set("Content-Type", "application/json")
        .send({ message: "hi", sessionId: "rate-test" });
      expect(res1.status).toBe(200);

      // Second request should be rate limited
      const res2 = await request(limitedApp)
        .post("/chat")
        .set("Content-Type", "application/json")
        .send({ message: "hi", sessionId: "rate-test" });
      expect(res2.status).toBe(429);
      expect(res2.body.error).toContain("lot of messages");
    });

    it("logs rate limit events", async () => {
      process.env.RATE_LIMIT_SESSION_MAX = "1";
      const limitedApp = createApp();
      delete process.env.RATE_LIMIT_SESSION_MAX;

      mockMatchFaq.mockReturnValue({ intent: "greeting", reply: "hi" });

      await request(limitedApp)
        .post("/chat")
        .set("Content-Type", "application/json")
        .send({ message: "hi", sessionId: "rate-log" });
      await request(limitedApp)
        .post("/chat")
        .set("Content-Type", "application/json")
        .send({ message: "hi", sessionId: "rate-log" });

      expect(mockLogRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          limiter: "session",
          sessionId: "rate-log",
        }),
      );
    });
  });
});
