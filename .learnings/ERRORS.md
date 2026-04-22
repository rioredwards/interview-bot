## [ERR-20260328-001] local_preview_cors_blocked_on_nondefault_port

**Logged**: 2026-03-28T15:55:00-07:00
**Priority**: medium
**Status**: resolved
**Area**: backend

### Summary
Local portfolio previews on ports other than `3000` were blocked by the interview-bot CORS allowlist.

### Error
```text
403 {"error":"Origin not allowed"}
```

### Context
- Frontend preview origin: `http://localhost:3002`
- Backend target: `http://localhost:1807`
- Root cause: `src/app.ts` only auto-allowed `http://localhost:3000` and `http://127.0.0.1:3000` in non-production mode

### Suggested Fix
Treat localhost development origins generically in non-production, rather than hard-coding one preview port.

### Metadata
- Reproducible: yes
- Related Files: `src/app.ts`, `src/__tests__/routes.test.ts`

### Resolution
- **Resolved**: 2026-03-28T15:55:00-07:00
- **Notes**: Updated dev CORS handling to allow localhost and loopback origins on any local port, and added regression coverage for `http://localhost:3002`.

---

## [ERR-20260422-001] stale_agent_skills_path_in_project_instructions

**Logged**: 2026-04-22T01:36:29-07:00
**Priority**: low
**Status**: workaround
**Area**: agent tooling

### Summary
The project instructions reference `~/coding/agent-skills/scripts/skill-sync`, but the actual canonical path on this machine is `/Users/rioredwards/dev/agent-skills/scripts/skill-sync`.

### Error
```text
zsh:1: no such file or directory: /Users/rioredwards/coding/agent-skills/scripts/skill-sync
```

### Context
- The first project skill sync failed because `~/coding/agent-skills` does not exist.
- Running `/Users/rioredwards/dev/agent-skills/scripts/skill-sync sync --project /Users/rioredwards/dev/interview-bot` succeeded.

### Suggested Fix
Update the shared AGENTS instructions or add a stable symlink so future agents can run the documented command without guessing the current local path.

### Metadata
- Reproducible: yes
- Related Files: `AGENTS.md`, `.agent-context.json`

---

## [ERR-20260422-002] docker_daemon_unavailable_for_local_image_build

**Logged**: 2026-04-22T01:36:29-07:00
**Priority**: low
**Status**: workaround
**Area**: deployment verification

### Summary
Local Docker image verification could not run because Docker Desktop was not running.

### Error
```text
ERROR: Cannot connect to the Docker daemon at unix:///Users/rioredwards/.docker/run/docker.sock. Is the docker daemon running?
```

### Context
- `docker` is installed at `/usr/local/bin/docker`.
- `docker build -t interview-bot:verify .` failed before building.
- `flyctl deploy --remote-only --config fly.toml --build-only` succeeded and validated the production image through Fly's remote builder.

### Suggested Fix
Use Fly remote build-only verification when Docker Desktop is unavailable, or start Docker Desktop before local image checks.

### Metadata
- Reproducible: environment-dependent
- Related Files: `Dockerfile`, `fly.toml`

---
