import crypto from "crypto";
import type { TokenUsage } from "./chat-provider.js";

export type Provider = "faq" | "anthropic" | "openai";

interface RequestLogEntry {
  event: "chat_request" | "sms_request";
  timestamp: string;
  sessionId: string;
  ipHash: string;
  provider: Provider;
  faqIntent?: string;
  tokens?: TokenUsage;
  durationMs: number;
}

interface RateLimitLogEntry {
  event: "rate_limited";
  timestamp: string;
  ipHash: string;
  limiter: "ip" | "session";
  sessionId?: string;
}

type LogEntry = RequestLogEntry | RateLimitLogEntry;

/** Hash an IP address so we can track patterns without storing raw IPs. */
function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 12);
}

function emit(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}

export function logRequest(opts: {
  event: "chat_request" | "sms_request";
  sessionId: string;
  ip: string;
  provider: Provider;
  faqIntent?: string;
  tokens?: TokenUsage;
  durationMs: number;
}): void {
  const entry: RequestLogEntry = {
    event: opts.event,
    timestamp: new Date().toISOString(),
    sessionId: opts.sessionId,
    ipHash: hashIp(opts.ip),
    provider: opts.provider,
    durationMs: opts.durationMs,
  };
  if (opts.faqIntent) entry.faqIntent = opts.faqIntent;
  if (opts.tokens) entry.tokens = opts.tokens;
  emit(entry);
}

export function logRateLimit(opts: {
  ip: string;
  limiter: "ip" | "session";
  sessionId?: string;
}): void {
  emit({
    event: "rate_limited",
    timestamp: new Date().toISOString(),
    ipHash: hashIp(opts.ip),
    limiter: opts.limiter,
    sessionId: opts.sessionId,
  });
}
