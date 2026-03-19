import { describe, it, expect, vi, beforeEach } from "vitest";
import { logRequest, logRateLimit } from "../logger.js";

describe("logger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  function getLastLog(): Record<string, unknown> {
    const call = consoleSpy.mock.calls.at(-1);
    expect(call).toBeDefined();
    return JSON.parse(call![0] as string);
  }

  describe("logRequest", () => {
    it("emits valid JSON with required fields", () => {
      logRequest({
        event: "chat_request",
        requestId: "req-1",
        sessionId: "test-123",
        ip: "192.168.1.1",
        provider: "anthropic",
        durationMs: 500,
      });

      const log = getLastLog();
      expect(log.event).toBe("chat_request");
      expect(log.requestId).toBe("req-1");
      expect(log.sessionId).toBe("test-123");
      expect(log.provider).toBe("anthropic");
      expect(log.durationMs).toBe(500);
      expect(log.timestamp).toBeDefined();
      expect(log.ipHash).toBeDefined();
    });

    it("hashes IP addresses (never raw IP in output)", () => {
      logRequest({
        event: "chat_request",
        requestId: "req-2",
        sessionId: "test",
        ip: "192.168.1.1",
        provider: "faq",
        durationMs: 0,
      });

      const log = getLastLog();
      expect(log.ipHash).not.toBe("192.168.1.1");
      expect(log.ipHash).toMatch(/^[a-f0-9]{12}$/);
      // Must not contain raw IP anywhere in the log
      expect(JSON.stringify(log)).not.toContain("192.168.1.1");
    });

    it("produces deterministic hashes for the same IP", () => {
      logRequest({
        event: "chat_request",
        requestId: "req-3",
        sessionId: "a",
        ip: "10.0.0.1",
        provider: "faq",
        durationMs: 0,
      });
      const hash1 = getLastLog().ipHash;

      logRequest({
        event: "chat_request",
        requestId: "req-4",
        sessionId: "b",
        ip: "10.0.0.1",
        provider: "faq",
        durationMs: 0,
      });
      const hash2 = getLastLog().ipHash;

      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different IPs", () => {
      logRequest({
        event: "chat_request",
        requestId: "req-5",
        sessionId: "a",
        ip: "10.0.0.1",
        provider: "faq",
        durationMs: 0,
      });
      const hash1 = getLastLog().ipHash;

      logRequest({
        event: "chat_request",
        requestId: "req-6",
        sessionId: "a",
        ip: "10.0.0.2",
        provider: "faq",
        durationMs: 0,
      });
      const hash2 = getLastLog().ipHash;

      expect(hash1).not.toBe(hash2);
    });

    it("emits ISO 8601 timestamp", () => {
      logRequest({
        event: "chat_request",
        requestId: "req-7",
        sessionId: "test",
        ip: "1.2.3.4",
        provider: "faq",
        durationMs: 0,
      });

      const log = getLastLog();
      expect(() => new Date(log.timestamp as string)).not.toThrow();
      expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("includes faqIntent when provided", () => {
      logRequest({
        event: "chat_request",
        requestId: "req-8",
        sessionId: "test",
        ip: "1.2.3.4",
        provider: "faq",
        faqIntent: "greeting",
        durationMs: 0,
      });

      expect(getLastLog().faqIntent).toBe("greeting");
    });

    it("omits faqIntent when not provided", () => {
      logRequest({
        event: "chat_request",
        requestId: "req-9",
        sessionId: "test",
        ip: "1.2.3.4",
        provider: "anthropic",
        durationMs: 100,
      });

      expect(getLastLog()).not.toHaveProperty("faqIntent");
    });

    it("includes token usage when provided", () => {
      logRequest({
        event: "chat_request",
        requestId: "req-10",
        sessionId: "test",
        ip: "1.2.3.4",
        provider: "openai",
        tokens: { inputTokens: 500, outputTokens: 100 },
        durationMs: 1500,
      });

      const log = getLastLog();
      expect(log.tokens).toEqual({ inputTokens: 500, outputTokens: 100 });
    });

    it("omits tokens when not provided", () => {
      logRequest({
        event: "chat_request",
        requestId: "req-11",
        sessionId: "test",
        ip: "1.2.3.4",
        provider: "faq",
        durationMs: 0,
      });

      expect(getLastLog()).not.toHaveProperty("tokens");
    });

    it("supports sms_request event", () => {
      logRequest({
        event: "sms_request",
        requestId: "req-12",
        sessionId: "+15551234567",
        ip: "1.2.3.4",
        provider: "openai",
        durationMs: 2000,
      });

      expect(getLastLog().event).toBe("sms_request");
    });
  });

  describe("logRateLimit", () => {
    it("emits valid JSON with required fields", () => {
      logRateLimit({
        requestId: "req-13",
        ip: "192.168.1.1",
        limiter: "ip",
      });

      const log = getLastLog();
      expect(log.event).toBe("rate_limited");
      expect(log.requestId).toBe("req-13");
      expect(log.limiter).toBe("ip");
      expect(log.timestamp).toBeDefined();
      expect(log.ipHash).toBeDefined();
    });

    it("hashes the IP address", () => {
      logRateLimit({
        requestId: "req-14",
        ip: "10.0.0.5",
        limiter: "session",
      });

      const log = getLastLog();
      expect(JSON.stringify(log)).not.toContain("10.0.0.5");
      expect(log.ipHash).toMatch(/^[a-f0-9]{12}$/);
    });

    it("includes sessionId when provided", () => {
      logRateLimit({
        requestId: "req-15",
        ip: "1.2.3.4",
        limiter: "session",
        sessionId: "sess-abc",
      });

      expect(getLastLog().sessionId).toBe("sess-abc");
    });

    it("supports both limiter types", () => {
      logRateLimit({ requestId: "req-16", ip: "1.2.3.4", limiter: "ip" });
      expect(getLastLog().limiter).toBe("ip");

      logRateLimit({
        requestId: "req-17",
        ip: "1.2.3.4",
        limiter: "session",
      });
      expect(getLastLog().limiter).toBe("session");
    });
  });
});
