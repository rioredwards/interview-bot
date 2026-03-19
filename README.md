# Interview Bot

[![CI](https://github.com/rioredwards/interview-bot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/rioredwards/interview-bot/actions/workflows/ci.yml)

Interview Bot is a TypeScript + Express API that powers Rio Edwards' portfolio chat widget and SMS assistant.
It answers questions about Rio's work using a fast FAQ matcher first, then falls back to LLM providers for open-ended prompts.

## Stack

- Node.js + Express 5
- TypeScript (`tsx` for dev, `tsc` for build)
- Anthropic SDK (primary provider)
- OpenAI SDK (optional fallback provider)
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

Rate limiting config:

- `RATE_LIMIT_IP_MAX` (default: `30`)
- `RATE_LIMIT_IP_WINDOW_MS` (default: `3600000`)
- `RATE_LIMIT_SESSION_MAX` (default: `20`)
- `RATE_LIMIT_SESSION_WINDOW_MS` (default: `3600000`)

Input limits:

- `MAX_MESSAGE_LENGTH` (default: `1000`)
- `MAX_HISTORY_TURNS` (default: `20`)

Notes:

- OpenAI fallback is enabled only when `OPENAI_API_KEY` is set and `FALLBACK_ENABLED` is not `false`.
- Fallback configuration is evaluated at process startup. Restart the server after changing related env vars.

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
5. Verify from a public network:

```bash
curl https://<machine>.<tailnet>.ts.net/health
```

### Option B: Deploy to a Node host (Render, Railway, Fly.io, similar)

1. Set build command: `npm ci && npm run build`
2. Set start command: `npm run start`
3. Provide required env vars (`ANTHROPIC_API_KEY` at minimum).
4. Set `PORT` only if your host requires a fixed value.
5. Confirm public health endpoint returns `{ "status": "ok" }`.
6. Point `NEXT_PUBLIC_INTERVIEW_BOT_URL` to the hosted HTTPS URL.

## Production Operations

### Logging and observability

- Logs are emitted as structured JSON on stdout.
- Request logs include provider (`faq`, `anthropic`, `openai`) and duration.
- LLM token usage is logged when available.
- IPs are hashed before logging (`ipHash`) to reduce sensitive data exposure.

### Runbook checks

- Health check: `GET /health`
- Chat smoke test: `POST /chat` with test `sessionId`
- SMS smoke test: send Twilio test message to webhook

### Rate limit tuning

- If users see frequent `429`, raise `RATE_LIMIT_SESSION_MAX` first.
- If traffic spikes from one source IP, tune `RATE_LIMIT_IP_MAX` and window.
- Keep windows aligned to realistic user behavior, often 15-60 minutes.

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
