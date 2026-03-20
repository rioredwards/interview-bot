import { describe, it, expect } from "vitest";
import { loadConfig } from "../config.js";

/** Helper: builds a minimal valid env and merges overrides. */
function env(overrides: Record<string, string> = {}): Record<string, string | undefined> {
  return { ...overrides };
}

describe("loadConfig", () => {
  describe("defaults", () => {
    it("applies default values when env is empty", () => {
      const config = loadConfig(env());
      expect(config.PORT).toBe(3333);
      expect(config.SHUTDOWN_GRACE_MS).toBe(10000);
      expect(config.MAX_MESSAGE_LENGTH).toBe(1000);
      expect(config.MAX_HISTORY_TURNS).toBe(20);
      expect(config.MAX_SESSION_ID_LENGTH).toBe(128);
      expect(config.MAX_REQUEST_BODY_BYTES).toBe(16 * 1024);
      expect(config.RATE_LIMIT_IP_MAX).toBe(30);
      expect(config.RATE_LIMIT_SESSION_MAX).toBe(20);
      expect(config.SESSION_TTL_MS).toBe(24 * 60 * 60 * 1000);
      expect(config.PROVIDER_TIMEOUT_MS).toBe(15000);
      expect(config.ENABLE_TWILIO_SMS).toBe(false);
      expect(config.REDIS_CONNECT_TIMEOUT_MS).toBe(2000);
      expect(config.MAX_ACTIVE_SESSIONS).toBe(5000);
    });
  });

  describe("coercion", () => {
    it("coerces string to number for positive int fields", () => {
      const config = loadConfig(env({ PORT: "8080", MAX_MESSAGE_LENGTH: "500" }));
      expect(config.PORT).toBe(8080);
      expect(config.MAX_MESSAGE_LENGTH).toBe(500);
    });

    it("falls back to default for invalid numeric strings", () => {
      const config = loadConfig(env({ PORT: "not-a-number", MAX_HISTORY_TURNS: "-5" }));
      expect(config.PORT).toBe(3333);
      expect(config.MAX_HISTORY_TURNS).toBe(20);
    });

    it("falls back to default for zero values", () => {
      const config = loadConfig(env({ PORT: "0" }));
      expect(config.PORT).toBe(3333);
    });
  });

  describe("CSV parsing", () => {
    it("parses CORS_ALLOWED_ORIGINS from comma-separated string", () => {
      const config = loadConfig(
        env({ CORS_ALLOWED_ORIGINS: "https://a.com, https://b.com , https://c.com" }),
      );
      expect(config.CORS_ALLOWED_ORIGINS).toEqual([
        "https://a.com",
        "https://b.com",
        "https://c.com",
      ]);
    });

    it("returns empty array when CORS_ALLOWED_ORIGINS is not set", () => {
      const config = loadConfig(env());
      expect(config.CORS_ALLOWED_ORIGINS).toEqual([]);
    });

    it("filters out empty segments from trailing commas", () => {
      const config = loadConfig(env({ CORS_ALLOWED_ORIGINS: "https://a.com,," }));
      expect(config.CORS_ALLOWED_ORIGINS).toEqual(["https://a.com"]);
    });
  });

  describe("boolean parsing", () => {
    it("parses ENABLE_TWILIO_SMS 'true' to true", () => {
      const config = loadConfig(env({ ENABLE_TWILIO_SMS: "true" }));
      expect(config.ENABLE_TWILIO_SMS).toBe(true);
    });

    it("parses ENABLE_TWILIO_SMS 'false' to false", () => {
      const config = loadConfig(env({ ENABLE_TWILIO_SMS: "false" }));
      expect(config.ENABLE_TWILIO_SMS).toBe(false);
    });

    it("defaults ENABLE_TWILIO_SMS to false for unrecognized values", () => {
      const config = loadConfig(env({ ENABLE_TWILIO_SMS: "maybe" }));
      expect(config.ENABLE_TWILIO_SMS).toBe(false);
    });
  });

  describe("TRUST_PROXY", () => {
    it("defaults to false outside production", () => {
      const config = loadConfig(env());
      expect(config.TRUST_PROXY).toBe(false);
    });

    it("defaults to 1 in production", () => {
      const config = loadConfig(env({ NODE_ENV: "production" }));
      expect(config.TRUST_PROXY).toBe(1);
    });

    it("parses 'true' to boolean true", () => {
      const config = loadConfig(env({ TRUST_PROXY: "true" }));
      expect(config.TRUST_PROXY).toBe(true);
    });

    it("parses 'false' to boolean false", () => {
      const config = loadConfig(env({ NODE_ENV: "production", TRUST_PROXY: "false" }));
      expect(config.TRUST_PROXY).toBe(false);
    });

    it("parses numeric string to number", () => {
      const config = loadConfig(env({ TRUST_PROXY: "2" }));
      expect(config.TRUST_PROXY).toBe(2);
    });

    it("falls back to env-based default for invalid string", () => {
      const config = loadConfig(env({ TRUST_PROXY: "garbage" }));
      expect(config.TRUST_PROXY).toBe(false);
    });
  });

  describe("derived values", () => {
    it("derives MAX_STORED_MESSAGES from MAX_HISTORY_TURNS when not set", () => {
      const config = loadConfig(env({ MAX_HISTORY_TURNS: "15" }));
      expect(config.MAX_STORED_MESSAGES).toBe(30);
    });

    it("uses explicit MAX_STORED_MESSAGES when set", () => {
      const config = loadConfig(
        env({ MAX_HISTORY_TURNS: "15", MAX_STORED_MESSAGES: "10" }),
      );
      expect(config.MAX_STORED_MESSAGES).toBe(10);
    });

    it("enables FALLBACK when OPENAI_API_KEY is present and FALLBACK_ENABLED is not 'false'", () => {
      const config = loadConfig(env({ OPENAI_API_KEY: "sk-test" }));
      expect(config.FALLBACK_ENABLED).toBe(true);
    });

    it("disables FALLBACK when FALLBACK_ENABLED is 'false'", () => {
      const config = loadConfig(
        env({ OPENAI_API_KEY: "sk-test", FALLBACK_ENABLED: "false" }),
      );
      expect(config.FALLBACK_ENABLED).toBe(false);
    });

    it("disables FALLBACK when OPENAI_API_KEY is missing", () => {
      const config = loadConfig(env());
      expect(config.FALLBACK_ENABLED).toBe(false);
    });
  });

  describe("REDIS_URL", () => {
    it("trims whitespace from REDIS_URL", () => {
      const config = loadConfig(env({ REDIS_URL: "  redis://localhost:6379  " }));
      expect(config.REDIS_URL).toBe("redis://localhost:6379");
    });

    it("returns undefined for empty REDIS_URL", () => {
      const config = loadConfig(env({ REDIS_URL: "  " }));
      expect(config.REDIS_URL).toBeUndefined();
    });
  });
});
