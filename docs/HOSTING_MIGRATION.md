# Hosting migration — Vercel + Fly.io relay split ("Path B")

> Status as of 2026-07-05: **code changes complete, deployment blocked on Fly.io payment method.**

## Why this split exists

The app was originally served entirely by a custom `server.js` (Next.js + a
WebSocket proxy to Sarvam STT bolted on, because Next's App Router can't host
a WebSocket route natively). That custom server can't run on serverless
platforms (Vercel Functions, AWS Lambda, etc.) — those can't hold a WebSocket
connection open for the length of a live therapy session (up to 50 min).

Vercel *did* add native WebSocket support to Functions (public beta, June
2026), but connection duration is capped to `maxDuration` (300s on Hobby,
up to 1800s beta-extended on Pro) — well short of a full session — and using
it would require added reconnect/resume logic for a feature carrying live
clinical audio. Decided against that for now.

**Chosen approach ("Path B"):** split the app in two.
- The Next.js app (everything except STT) → **Vercel**, serverless, ~$0/mo.
- The STT WebSocket relay → **Fly.io**, one small always-on process, ~$2–5/mo.

Rejected alternative ("Path A"): rewrite the relay as a Cloudflare Durable
Object for a fully serverless (both pieces) setup at $0/mo. Not done — bigger
rewrite for marginal savings over Path B; can revisit later.

Also rejected: Render. Works fine functionally, but Render's cheap "Starter"
instance (512MB) tends to OOM during this project's `next build` (Prisma +
Firebase Admin + LiveKit server SDK + OpenAI SDK all add up), pushing you to
the $25/mo "Standard" tier — pricier than the Vercel+Fly.io split for the
same result.

## Architecture

```
Browser
  ├── HTTPS  → Vercel (Next.js pages, API routes, everything except STT)
  └── WSS    → Fly.io (relay/ — just the STT proxy)
```

The browser connects to the relay **cross-origin** (different host than the
app), so the old same-origin trust assumption no longer holds. Auth: the
relay verifies a live Firebase ID token (passed as a WS query param, since
browsers can't set WS headers) via `firebase-admin` before opening the
upstream Sarvam connection. This also closes a pre-existing gap — the
original `server.js` had a `// TODO (harden later)` admitting it was gated
only by same-origin + a session id, no real auth.

## What changed in the codebase

| File | Change |
|---|---|
| `relay/server.js` | **New.** Standalone WS relay — trimmed copy of the old `server.js`'s proxy logic, plus Firebase ID token verification. No DB access, no Next.js. |
| `relay/package.json` | **New.** Minimal deps: `ws`, `firebase-admin` only. |
| `relay/Dockerfile` | **New.** Node 20 alpine, installs relay deps, runs `server.js`. |
| `relay/fly.toml` | **New.** `shared-cpu-1x` / 256MB, `primary_region = "bom"` (Mumbai), `min_machines_running = 1` (no cold-sleep mid-session), `/health` check. |
| `server.js` (root) | **Deleted.** Its only job (the WS proxy) moved to `relay/`. |
| `package.json` (root) | `dev`/`start` scripts changed from `node server.js` to plain `next dev`/`next start`. Removed unused `ws` and `@types/ws` deps. |
| `src/hooks/useSessionTranscription.ts` | `buildProxyUrl()` → `buildRelayUrl()`: now points at `NEXT_PUBLIC_STT_RELAY_URL` (cross-origin) instead of `window.location.host`, and attaches a live Firebase ID token as a `token` query param. `startPipe` became `async` to await the token fetch; added a placeholder-in-map guard so a `stopPipe()` firing mid-fetch can't race into opening an orphaned socket. |
| `docs/TECH_KNOWLEDGE.md` | Added a "Hosting split" note and split the env var list into app-side (Vercel) vs relay-side (Fly.io). |

## Verification done so far (2026-07-02/03)

No real credentials available (no `.env` exists locally, no Fly.io account
funded yet), so verification was structural, not a full live session:

- `npx tsc --noEmit` — clean (after regenerating a stale Prisma client;
  unrelated pre-existing issue, not caused by this migration).
- `relay/`: `npm install` clean, minimal deps.
- Relay boots successfully with placeholder-but-structurally-valid Firebase
  credentials → `> STT relay ready on port 8080`.
- `/health` → `200 ok`.
- WS connect with no token / garbage token / empty token → all three
  correctly rejected with `4401 Unauthorized`, no upstream Sarvam connection
  attempted in any case.

**Not yet verified** (needs real credentials): a valid Firebase ID token
actually succeeding through to Sarvam, the full browser → relay → Sarvam →
transcript round trip, and the Vercel-side build/deploy of the simplified app.

## Current blocker

Fly.io requires a card on file before `flyctl launch`/`flyctl deploy` will
work, even at near-zero usage. `flyctl` v0.4.66 is installed locally
(`C:\Users\cogni\.fly\bin`, added to User PATH), account registration was
started but not completed with a payment method. **Paused here until a card
is available.**

## Remaining steps, once unblocked

1. `flyctl auth login` (or `flyctl auth signup` if the in-progress
   registration needs finishing) — opens a browser, needs your credentials.
2. `flyctl auth whoami` — confirm login.
3. From `relay/`: `flyctl launch --no-deploy` — reads `fly.toml`, links the
   app to your account, confirm app name/region (`staad-stt-relay` / `bom`).
4. Set relay secrets:
   ```
   flyctl secrets set SARVAM_API_KEY=... FIREBASE_PROJECT_ID=... \
     FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY=...
   ```
5. `flyctl deploy`
6. On Vercel: connect the GitHub repo, set app-side env vars (see below),
   including `NEXT_PUBLIC_STT_RELAY_URL` pointing at the deployed Fly.io
   hostname (`wss://staad-stt-relay.fly.dev`).
7. For local dev in the meantime: run `node relay/server.js` alongside
   `next dev`, with `NEXT_PUBLIC_STT_RELAY_URL=ws://localhost:8080` in
   `.env.local`, to exercise the STT flow before Fly.io is live.
8. Once both are live, do the full end-to-end verify: real session, real
   audio, confirm transcript chunks land in Firestore.

## Env vars — reference

**App (Vercel):** `DATABASE_URL`; `LIVEKIT_API_KEY/SECRET`,
`NEXT_PUBLIC_LIVEKIT_URL`; `NVIDIA_API_KEY`; `NEXT_PUBLIC_STT_RELAY_URL`;
`OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`/`OPENROUTER_SITE_URL`);
`DEEPGRAM_API_KEY/PROJECT_ID` (legacy); `CRON_SECRET`;
`SMTP_HOST/PORT/USER/PASS/FROM`; `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`.

**Relay (Fly.io):** `SARVAM_API_KEY`;
`FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` (same Firebase project as the
app, used only to verify ID tokens — the relay has no DB access).

## Also noted during this work (unrelated, still open)

- No `.env` file exists anywhere in the project — every env var above is
  currently unset locally. `docs/cleanup-transcripts` cron
  (`vercel.json` → `/api/cleanup-transcripts` daily) won't carry over to
  non-Vercel hosting automatically if the app ever moves off Vercel; if it
  stays on Vercel this is unaffected.
- GitHub repo (`https://github.com/Om-2611/smart-therapy-and-ai-digital-platform`,
  branch `main`) was in sync with local work as of 2026-07-03, except for
  `docs/internship-jd.md` (local-only, never pushed) and a local
  `.claude/scheduled_tasks.lock` artifact (should not be pushed).
