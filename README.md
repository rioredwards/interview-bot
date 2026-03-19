# Interview Bot

[![CI](https://github.com/rioredwards/interview-bot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/rioredwards/interview-bot/actions/workflows/ci.yml)

Interview Bot is a TypeScript + Express API that powers Rio Edwards' portfolio chat widget and SMS assistant.
It answers questions about Rio's work using a fast FAQ matcher first, then falls back to LLM providers for open-ended prompts.

## Stack

- Node.js + Express 5
- TypeScript (`tsx` for dev, `tsc` for build)
- Anthropic SDK (primary provider)
- OpenAI SDK (optional fallback provider)
- Redis-backed `express-rate-limit` store (optional)
- Helmet security headers middleware
- Twilio webhook endpoint for SMS
- Vitest + Supertest test suite

## Architecture

Request flow:

1. Client calls `POST /chat` (web) or `POST /sms` (Twilio).
2. Input validation and rate limiting run first.
3. `faq-router.ts` tries an intent match for common questions.
4. If FAQ hits, response returns immediately without calling an LLM.
5. If FAQ misses, `chat-provider.ts` calls Anthropic.
6. If Anthropic fails and fallback is enabled, request retries with OpenAI.
7. Structured JSON logs are emitted for request, token usage, and rate limit events.

Core files:

- `src/app.ts`: Express app, routes, validation, in-memory conversation state, rate limiting.
- `src/chat-provider.ts`: Anthropic call and OpenAI fallback logic.
- `src/faq-router.ts`: deterministic FAQ intent matching.
- `src/system-prompt.ts`: loads `system-prompt.xml` from disk.
- `src/logger.ts`: structured logging with hashed IP addresses.
- `src/index.ts`: server bootstrap and listen port.

## API Endpoints

- `GET /health`
  - Returns `{ "status": "ok" }`.

- `POST /chat`
  - JSON body: `{ "message": "...", "sessionId": "..." }`
  - Returns: `{ "reply": "..." }` or `{ "error": "..." }`

- `POST /sms`
  - Form body from Twilio (`From`, `Body`)
  - Returns TwiML XML response

## Local Development

Prerequisites:

- Node.js 20+
- npm
- Anthropic API key

Setup:

```bash
npm install
cp .env.example .env
```

Add environment values in `.env`.

Run in dev mode:

```bash
npm run dev
```

Default local URL:

- `http://localhost:1807`

Quick health check:

```bash
curl http://localhost:1807/health
```

## Scripts

- `npm run dev`: start with file watching via `tsx`.
- `npm run build`: compile TypeScript to `dist/`.
- `npm run start`: run compiled server from `dist/index.js`.
- `npm run typecheck`: TypeScript type check without emit.
- `npm test`: run test suite once (`vitest run`).
- `npm run test:watch`: run tests in watch mode.

## Environment Variables

Required for normal web chat behavior:

- `ANTHROPIC_API_KEY`: primary LLM provider key.

Optional fallback and integration keys:

- `OPENAI_API_KEY`: enables OpenAI fallback when Anthropic fails.
- `FALLBACK_ENABLED`: set to `false` to force-disable fallback.
- `TWILIO_ACCOUNT_SID`: required for Twilio integration setup.
- `TWILIO_AUTH_TOKEN`: required for Twilio integration setup.

Server config:

- `PORT` (default: `1807`)
- `SHUTDOWN_GRACE_MS` (default: `10000`): max wait for graceful shutdown before forced exit.

Provider timeout config:

- `PROVIDER_TIMEOUT_MS` (default: `15000`): timeout applied to each upstream provider call.

CORS and proxy config:

- `CORS_ALLOWED_ORIGINS`: comma-separated HTTPS origins allowed for browser clients. If unset, only localhost origins are allowed.
- `TRUST_PROXY`: Express `trust proxy` setting. Defaults to `1` in production and `false` outside production.

Rate limiting config:

- `RATE_LIMIT_IP_MAX` (default: `30`)
- `RATE_LIMIT_IP_WINDOW_MS` (default: `3600000`)
- `RATE_LIMIT_SESSION_MAX` (default: `20`)
- `RATE_LIMIT_SESSION_WINDOW_MS` (default: `3600000`)
- `REDIS_URL` (optional): enables shared Redis-backed rate limiter state across instances.
- `REDIS_CONNECT_TIMEOUT_MS` (default: `2000`): timeout for initial Redis connection before fallback.

Input limits:

- `MAX_MESSAGE_LENGTH` (default: `1000`)
- `MAX_HISTORY_TURNS` (default: `20`)

Session memory cleanup:

- `SESSION_TTL_MS` (default: `86400000`): session expires after this inactivity window.
- `SESSION_CLEANUP_INTERVAL_MS` (default: `300000`): cleanup sweep interval for stale sessions.

Notes:

- OpenAI fallback is enabled only when `OPENAI_API_KEY` is set and `FALLBACK_ENABLED` is not `false`.
- Fallback configuration is evaluated at process startup. Restart the server after changing related env vars.
- Session cleanup is in-memory only. Restarts clear all sessions.
- Provider timeout and shutdown settings are read at process startup. Restart after changing them.
- Rate limiter uses Redis when `REDIS_URL` is available. If Redis is unavailable at startup, limiter falls back to in-memory mode.

## Deployment

### Option A: Self-hosted with Tailscale Funnel (current production pattern)

1. Build and run the service on the host:

```bash
npm ci
npm run build
PORT=1807 npm run start
```

2. Expose the process publicly via Tailscale Funnel:

```bash
tailscale funnel 1807
```

3. Copy the generated HTTPS URL (for example `https://<machine>.<tailnet>.ts.net`).
4. In the portfolio frontend deployment environment, set:
   - `NEXT_PUBLIC_INTERVIEW_BOT_URL=<funnel-url>`
5. Set API env vars on the bot host:
   - `CORS_ALLOWED_ORIGINS=https://rioedwards.com,https://www.rioedwards.com`
   - `TRUST_PROXY=1`
6. Verify from a public network:

```bash
curl https://<machine>.<tailnet>.ts.net/health
```

### Option B: Deploy to a Node host (Render, Railway, Fly.io, similar)

1. Set build command: `npm ci && npm run build`
2. Set start command: `npm run start`
3. Provide required env vars (`ANTHROPIC_API_KEY` at minimum).
4. Set `CORS_ALLOWED_ORIGINS` to your portfolio origin(s).
5. Set `TRUST_PROXY=1` unless your host docs require a different value.
6. Set `REDIS_URL` for shared rate limiting across replicas and restarts.
7. Set `PORT` only if your host requires a fixed value.
8. Confirm public health endpoint returns `{ "status": "ok" }`.
9. Point `NEXT_PUBLIC_INTERVIEW_BOT_URL` to the hosted HTTPS URL.

### Railway config in repo

- `railway.toml` defines build/start commands and `/health` health check defaults.
- Railway runtime secrets still need to be set in Railway Variables.

## Production Operations

### Logging and observability

- Logs are emitted as structured JSON on stdout.
- Each request receives a `requestId` and is returned in the `x-request-id` response header.
- Request logs include provider (`faq`, `anthropic`, `openai`) and duration.
- LLM token usage is logged when available.
- IPs are hashed before logging (`ipHash`) to reduce sensitive data exposure.

### Uptime checks and alerts

- Configure an uptime monitor against `GET /health` from at least one external region.
- Check interval: 60 seconds.
- Failure policy: alert after 2 consecutive failures.
- Recovery policy: send a recovery notification after 1 successful check.

Suggested alert thresholds:

- `5xx` rate: warn at `> 2%` over 5 minutes, critical at `> 5%` over 5 minutes.
- `429` rate limit spikes: warn at `> 10%` over 10 minutes, critical at `> 20%` over 10 minutes.
- Provider fallback usage: warn when `openai` serves `> 30%` of requests for 15 minutes.

### Security headers

- Helmet is enabled globally in `src/app.ts` to apply baseline HTTP security headers.
- Expected headers include `x-content-type-options` and `x-frame-options` on API responses.
- CORS behavior remains controlled by the allowlist and still supports configured portfolio origins.

### Runbook checks

- Health check: `GET /health`
- Chat smoke test: `POST /chat` with test `sessionId`
- SMS smoke test: send Twilio test message to webhook
- Optional memory tuning: adjust `SESSION_TTL_MS` and `SESSION_CLEANUP_INTERVAL_MS` for expected traffic patterns

### Graceful shutdown

- Service handles `SIGTERM` and `SIGINT` in `src/index.ts` and closes the HTTP server gracefully.
- During shutdown, the server stops accepting new connections.
- If shutdown exceeds `SHUTDOWN_GRACE_MS`, process exits to avoid hanging indefinitely.

### Rate limit tuning

- If users see frequent `429`, raise `RATE_LIMIT_SESSION_MAX` first.
- If traffic spikes from one source IP, tune `RATE_LIMIT_IP_MAX` and window.
- Keep windows aligned to realistic user behavior, often 15-60 minutes.
- For multi-replica deployments, set `REDIS_URL` so limits survive app restarts and stay shared across instances.

### Incident runbook

- `health check failing`: verify process is running, then check startup logs for Redis/provider errors, and confirm network/path to `/health`.
- `5xx spike`: filter logs by `requestId`, confirm whether failures come from provider timeout, provider errors, or bad input.
- `429 spike`: inspect `rate_limited` logs by `limiter` (`ip` or `session`) and adjust limits if legitimate traffic changed.
- `fallback surge`: if `openai` usage spikes, validate Anthropic status and credentials, then raise timeout or failover plan as needed.

### Key rotation

- Rotate `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in your host secret manager.
- Restart the service after key updates.
- Run a health check and one `/chat` smoke test after restart.

## Testing and Verification

Run before deploy:

```bash
npm run typecheck
npm test
npm run build
```

Post-deploy smoke check:

```bash
npm run deploy:check -- https://<your-railway-domain>
```

## Troubleshooting

### Anthropic errors and OpenAI fallback

Symptoms:

- Logs show `Anthropic error:` followed by successful response.
- Provider in logs changes to `openai`.

Checks:

1. Confirm `OPENAI_API_KEY` is set.
2. Confirm `FALLBACK_ENABLED` is not `false`.
3. Restart the process after env changes.
4. Verify OpenAI model access for `gpt-4o`.

If fallback is disabled or misconfigured, Anthropic failures return a generic `500` error for web and a generic failure SMS response.

### Provider timeouts

Symptoms:

- Web chat returns `504` with a friendly timeout message.
- SMS returns a friendly timeout response instead of hanging.

Checks:

1. Confirm network egress and provider API status.
2. Increase `PROVIDER_TIMEOUT_MS` if upstream latency is consistently high.
3. Validate fallback behavior by checking provider logs (`anthropic` vs `openai`).

### Redis rate limiter fallback

Symptoms:

- Logs show `Redis unavailable for rate limiting. Falling back to in-memory store.`
- Rate limit counters reset after app restart.

Checks:

1. Confirm `REDIS_URL` is set and reachable from the host.
2. Increase `REDIS_CONNECT_TIMEOUT_MS` if startup networking is slow.
3. Restart the app and verify rate limit counters persist across restart when Redis is healthy.

### Unexpected `429` responses

Checks:

1. Inspect logs for `event: "rate_limited"` and `limiter` type (`ip` or `session`).
2. Confirm frontend sends stable `sessionId` values.
3. Increase relevant rate limits for real traffic patterns.

### Twilio webhook issues

Checks:

1. Confirm Twilio sends form-encoded payloads with `From` and `Body`.
2. Ensure webhook points to `POST /sms` on your public HTTPS URL.
3. Verify your Twilio account and sender are fully configured for your target region.

## Security Notes

- Do not commit `.env` or provider keys.
- Treat all inbound prompt content as untrusted user input.
- Keep `system-prompt.xml` under review since it defines model behavior.
