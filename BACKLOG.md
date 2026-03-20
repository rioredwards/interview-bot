# Interview Bot Backlog

## Open (Priority Order)

- [ ] **Flesh out the system prompt** (portfolio issue #62)
  - `system-prompt.xml` still has some thin/placeholder sections
  - Read from `~/Documents/Career` to fill in real project details, skills, salary range, etc.
  - The XML structure is solid; just needs real content

- [ ] **Expose for production via Tailscale Funnel** (portfolio issue #63)
  - Run: `tailscale funnel 1807`
  - Get the public URL (e.g. `https://rios-mac-mini.tail112424.ts.net`)
  - Set `NEXT_PUBLIC_INTERVIEW_BOT_URL` in Vercel env vars for the portfolio
  - Without this, the widget is broken on the live site

## Notes

- Bot runs on port **1807** ("ibot" in leet)
- Stack: Node.js + Express + Anthropic SDK + CORS
- No Docker; runs directly on Mac mini
- Portfolio widget: `components/interview-bot/InterviewBot.tsx` + `lib/useInterviewBot.ts` on `dev` branch
- SMS (Twilio) is wired up but blocked on A2P 10DLC registration (~10-15 biz days). Deprioritized.
