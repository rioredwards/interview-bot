# Interview Bot Backlog

## Open (Priority Order)

_(No open items.)_

## Done

- [x] **Flesh out the system prompt** (portfolio issue #62)
  - `system-prompt.xml` is now comprehensive (486 lines) with real project details, skills, work history, testimonials, and visitor guidance.

- [x] **Expose for production on Fly.io** (portfolio issue #63)
  - Production runs on Fly.io using `fly.toml` and `Dockerfile` for build, start, and health checks.
  - Portfolio frontend points to the hosted bot URL via `NEXT_PUBLIC_INTERVIEW_BOT_URL`.

## Notes

- Bot runs on port **1807** ("ibot" in leet)
- Stack: Node.js + Express + Anthropic SDK + CORS
- Production runs on Fly.io
- Portfolio widget: `components/interview-bot/InterviewBot.tsx` + `lib/useInterviewBot.ts` on `dev` branch
- SMS (Twilio) is wired up but blocked on A2P 10DLC registration (~10-15 biz days). Deprioritized.
