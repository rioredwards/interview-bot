import { z } from "zod";

/** Coerces a string env var to a positive integer, falling back to a default. */
function positiveInt(fallback: number) {
  return z
    .string()
    .optional()
    .transform((val) => {
      const parsed = Number.parseInt(val ?? "", 10);
      return !Number.isNaN(parsed) && parsed > 0 ? parsed : fallback;
    });
}

/** Coerces a string env var to a boolean, falling back to a default. */
function booleanish(fallback: boolean) {
  return z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === "") return fallback;
      const normalized = val.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
      return fallback;
    });
}

/** Parses a comma-separated string into an array of trimmed, non-empty strings. */
function csvList() {
  return z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return [] as string[];
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    });
}

/**
 * Parses TRUST_PROXY into boolean | number.
 * Falls back based on NODE_ENV when value is absent or unparseable.
 */
function trustProxy(nodeEnv: string | undefined) {
  const prodDefault: boolean | number = nodeEnv === "production" ? 1 : false;
  return z
    .string()
    .optional()
    .transform((val): boolean | number => {
      if (!val || val.trim() === "") return prodDefault;
      const normalized = val.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
      const numeric = Number.parseInt(normalized, 10);
      if (!Number.isNaN(numeric) && numeric >= 0) return numeric;
      return prodDefault;
    });
}

function buildSchema(nodeEnv: string | undefined) {
  return z.object({
    NODE_ENV: z.string().optional().default("development"),
    PORT: positiveInt(3333),
    SHUTDOWN_GRACE_MS: positiveInt(10000),

    // CORS
    CORS_ALLOWED_ORIGINS: csvList(),

    // Trust proxy
    TRUST_PROXY: trustProxy(nodeEnv),

    // Redis
    REDIS_URL: z
      .string()
      .optional()
      .transform((val) => val?.trim() || undefined),
    REDIS_CONNECT_TIMEOUT_MS: positiveInt(2000),

    // Rate limiting
    RATE_LIMIT_IP_MAX: positiveInt(30),
    RATE_LIMIT_IP_WINDOW_MS: positiveInt(60 * 60 * 1000),
    RATE_LIMIT_SESSION_MAX: positiveInt(20),
    RATE_LIMIT_SESSION_WINDOW_MS: positiveInt(60 * 60 * 1000),

    // Session management
    SESSION_TTL_MS: positiveInt(24 * 60 * 60 * 1000),
    SESSION_CLEANUP_INTERVAL_MS: positiveInt(5 * 60 * 1000),
    MAX_ACTIVE_SESSIONS: positiveInt(5000),

    // Input limits
    MAX_MESSAGE_LENGTH: positiveInt(1000),
    MAX_HISTORY_TURNS: positiveInt(20),
    MAX_STORED_MESSAGES: positiveInt(0), // 0 = derive from MAX_HISTORY_TURNS
    MAX_SESSION_ID_LENGTH: positiveInt(128),
    MAX_REQUEST_BODY_BYTES: positiveInt(16 * 1024),

    // Provider
    PROVIDER_TIMEOUT_MS: positiveInt(15000),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    FALLBACK_ENABLED: z
      .string()
      .optional()
      .transform((val) => val?.trim().toLowerCase()),

    // Twilio
    ENABLE_TWILIO_SMS: booleanish(false),
  });
}

export interface AppConfig {
  NODE_ENV: string;
  PORT: number;
  SHUTDOWN_GRACE_MS: number;
  CORS_ALLOWED_ORIGINS: string[];
  TRUST_PROXY: boolean | number;
  REDIS_URL: string | undefined;
  REDIS_CONNECT_TIMEOUT_MS: number;
  RATE_LIMIT_IP_MAX: number;
  RATE_LIMIT_IP_WINDOW_MS: number;
  RATE_LIMIT_SESSION_MAX: number;
  RATE_LIMIT_SESSION_WINDOW_MS: number;
  SESSION_TTL_MS: number;
  SESSION_CLEANUP_INTERVAL_MS: number;
  MAX_ACTIVE_SESSIONS: number;
  MAX_MESSAGE_LENGTH: number;
  MAX_HISTORY_TURNS: number;
  MAX_STORED_MESSAGES: number;
  MAX_SESSION_ID_LENGTH: number;
  MAX_REQUEST_BODY_BYTES: number;
  PROVIDER_TIMEOUT_MS: number;
  ANTHROPIC_API_KEY: string | undefined;
  OPENAI_API_KEY: string | undefined;
  FALLBACK_ENABLED: boolean;
  ENABLE_TWILIO_SMS: boolean;
}

/**
 * Parses and validates environment variables, returning a fully resolved config.
 * Call at startup or in tests; not cached, so tests that mutate process.env
 * before calling loadConfig() will get fresh values.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const schema = buildSchema(env.NODE_ENV);
  const result = schema.safeParse(env);

  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${fields}`);
  }

  const parsed = result.data;

  // Derived values
  const MAX_STORED_MESSAGES =
    parsed.MAX_STORED_MESSAGES > 0
      ? parsed.MAX_STORED_MESSAGES
      : parsed.MAX_HISTORY_TURNS * 2;

  const FALLBACK_ENABLED =
    parsed.FALLBACK_ENABLED !== "false" && !!parsed.OPENAI_API_KEY;

  return {
    NODE_ENV: parsed.NODE_ENV,
    PORT: parsed.PORT,
    SHUTDOWN_GRACE_MS: parsed.SHUTDOWN_GRACE_MS,
    CORS_ALLOWED_ORIGINS: parsed.CORS_ALLOWED_ORIGINS,
    TRUST_PROXY: parsed.TRUST_PROXY,
    REDIS_URL: parsed.REDIS_URL,
    REDIS_CONNECT_TIMEOUT_MS: parsed.REDIS_CONNECT_TIMEOUT_MS,
    RATE_LIMIT_IP_MAX: parsed.RATE_LIMIT_IP_MAX,
    RATE_LIMIT_IP_WINDOW_MS: parsed.RATE_LIMIT_IP_WINDOW_MS,
    RATE_LIMIT_SESSION_MAX: parsed.RATE_LIMIT_SESSION_MAX,
    RATE_LIMIT_SESSION_WINDOW_MS: parsed.RATE_LIMIT_SESSION_WINDOW_MS,
    SESSION_TTL_MS: parsed.SESSION_TTL_MS,
    SESSION_CLEANUP_INTERVAL_MS: parsed.SESSION_CLEANUP_INTERVAL_MS,
    MAX_ACTIVE_SESSIONS: parsed.MAX_ACTIVE_SESSIONS,
    MAX_MESSAGE_LENGTH: parsed.MAX_MESSAGE_LENGTH,
    MAX_HISTORY_TURNS: parsed.MAX_HISTORY_TURNS,
    MAX_STORED_MESSAGES,
    MAX_SESSION_ID_LENGTH: parsed.MAX_SESSION_ID_LENGTH,
    MAX_REQUEST_BODY_BYTES: parsed.MAX_REQUEST_BODY_BYTES,
    PROVIDER_TIMEOUT_MS: parsed.PROVIDER_TIMEOUT_MS,
    ANTHROPIC_API_KEY: parsed.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: parsed.OPENAI_API_KEY,
    FALLBACK_ENABLED,
    ENABLE_TWILIO_SMS: parsed.ENABLE_TWILIO_SMS,
  };
}
