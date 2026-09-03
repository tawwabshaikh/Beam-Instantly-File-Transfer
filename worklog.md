# Project Worklog — "Beam" Instant File Transfer

Product: **Beam** — cross-platform instant file transfer via QR pairing.
Stack: Next.js 16 (App Router, port 3000) + socket.io signaling mini-service (port 3003) + Prisma/SQLite + Tailwind 4 + shadcn/ui.

## Core Architecture (agreed design — all agents MUST follow)

```
Browser (desktop) ──HTTP──> Next.js API (/api/sessions ...) ──Prisma── SQLite (session metadata, token HASH only)
       │                                │ (proxies create/validate/end to service)
       │                                ▼
       └──WebSocket (socket.io)──> mini-services/session-service (port 3003) — SOURCE OF TRUTH for live sessions
                                        ├── session registry (in-memory, TTL sweep)
                                        ├── WebRTC signaling relay (offer/answer/ICE)
                                        └── file chunk pipe (secure relay fallback — pure pipe, zero file storage)

File transfer: WebRTC DataChannel (P2P, preferred) → automatic fallback to relay chunk-pipe through the service if P2P fails within 12s. Files NEVER stored on server.
```

- Socket.io client connects via `io('/?XTransformPort=3003', { path: '/' })` (Caddy gateway rule — NEVER put the port in the path).
- QR URL: `${window.location.origin}/?s=CODE&t=TOKEN` — opens the same `/` route which renders the mobile session view when `s`+`t` params exist.
- Session: 6-char code (Crockford base32, no ambiguous chars) + 12-char token (base32, crypto-random). Token stored **hashed (SHA-256)** server-side. TTL 10 min.
- Only route: `/` (view switching client-side). Nav: Transfer / History / About.
- Color system: emerald/teal primary + zinc neutrals, dark mode via next-themes. NO blue/indigo.
- Sticky footer: root wrapper `min-h-screen flex flex-col`, footer `mt-auto`.

## Socket Protocol v1 (client ⇄ mini-service)

Client→Server: `beam:join {code,token,role,device}` · `beam:signal {code,signal}` · `beam:mode {code,mode}` · `beam:manifest {code,files}` (host publishes downloadable files) · `beam:incoming {code,files}` (guest announces files to send) · `beam:transfer:request {code,transferId,fileId,direction}` · `beam:transfer:start {code,transferId,file,direction}` · `beam:transfer:chunk {code,transferId,seq,data:ArrayBuffer}` · `beam:transfer:ack {code,transferId,seq}` · `beam:transfer:done {code,transferId}` · `beam:transfer:cancel {code,transferId,reason?}` · `beam:transfer:error {code,transferId,message}` · `beam:end {code}`

Server→Client: `beam:joined {role,session}` · `beam:error {code,message}` · `beam:peer {event:'joined'|'left',device}` · `beam:signal` · `beam:mode` · `beam:manifest` · `beam:incoming` · (all transfer events forwarded to peer) · `beam:ended` · `beam:expired`

REST on service: `POST /sessions {files,ttlMinutes?}` → `{code,token,expiresAt}` · `GET /sessions/:code?token=` → session+manifest · `POST /sessions/:code/end?token=`. Rate-limited per IP.

---

## Work Log

---
Task ID: 1
Agent: main (orchestrator)
Task: Foundation — deps, schema, protocol types, config, plan

Work Log:
- Explored scaffold: Next.js 16 dev server running on :3000, shadcn/ui components present, prisma sqlite at db/custom.db, websocket demo reviewed.
- Installed socket.io-client + qrcode (main app).
- Defined protocol v1 (above) and full component/file layout.
- Created Prisma Session model (metadata only, token hash).

Stage Summary:
- Foundation ready; subagent 2-a builds mini-services/session-service against protocol v1; main agent builds client core + UI in parallel.

---
Task ID: 2-a
Agent: general-purpose
Task: Build mini-services/session-service (signaling + relay + session registry)

Work Log:
- Read worklog.md protocol v1 + mirrored `src/lib/beam/protocol.ts` into `mini-services/session-service/protocol.ts` (verbatim local copy, no cross-project imports).
- `sessions.ts`: SessionRegistry (in-memory Map, 6-char code / 12-char token from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` via crypto.getRandomValues, SHA-256 hex token hash + timing-safe compare), sliding-window RateLimiter (create 12/min, read+end 30/min, join 20/min per IP with periodic sweep), ChunkThrottle token bucket (3000 chunks/s/socket), file-manifest validator (1..20 files, 1 B..2 GB each, ≤4 GB total, name sanitization, server-side id generation for missing/duplicate ids).
- `index.ts`: port 3003 hardcoded; REST (POST /sessions, GET /sessions/:code?token=, POST /sessions/:code/end?token=) with CORS `*` default (`ALLOWED_ORIGINS` restricts) + OPTIONS preflight on all routes; socket.io on the SAME listener (`path:'/'`, cors `*`, pingTimeout 60000, pingInterval 25000, maxHttpBufferSize 2_000_000); implemented beam:join/signal/mode/manifest/incoming/transfer:request|start|chunk|ack|done|cancel|error/end, disconnect handling, 10s TTL sweeper (beam:expired + room destroy + delete, peerless reap after 2× TTL), per-event try/catch, graceful SIGINT/SIGTERM. Key discovery: engine.io's dispatcher (checked node_modules/engine.io/build/server.js:671 — `path === req.url.slice(0, path.length)`) intercepts EVERY url when path='/' and would 400 the REST routes; fixed by wrapping `io.engine.handleRequest` to route engine.io-looking requests (EIO=/transport= query) to engine.io and everything else to the REST handler.
- README.md: env vars (ALLOWED_ORIGINS), API/protocol reference, rate limits, security notes, production deployment (Caddy/nginx WS proxy, TURN via coturn with env-driven NEXT_PUBLIC_TURN_*, horizontal-scaling warning — in-memory state, single instance only).
- Verified: `bun install`; started service (plain + `bun run dev`); wrote /tmp/beam-test.ts (socket.io-client from main project node_modules) — 51/51 assertions passed: REST happy path + INVALID_TOKEN/NOT_FOUND/ENDED + preflight + ttl math; joins (host/guest/ROLE_TAKEN/rejoin); signal+mode relay incl. guest-mode drop; manifest persist + incoming relay; full transfer relay (request/start/5 chunks in order/acks/done/cancel/error); oversized chunk rejected ('Chunk too large'), non-binary dropped, throttle emits 'Rate limited' after ~3000/s; disconnect → beam:peer left + slot freed; beam:end → beam:ended to both + GET 410 ENDED; live-expiry test (ttl=1 → beam:expired emitted, GET 404 after sweep); create+join rate-limit hammers → 429/RATE_LIMITED. `tsc --noEmit` strict clean. Test service killed afterwards.

Stage Summary:
- Files created in mini-services/session-service/: package.json (name beam-session-service, scripts dev=`bun --hot index.ts`, start, typecheck; deps: socket.io ^4.8.3 only; devDeps bun-types+typescript for strict typecheck), index.ts, protocol.ts, sessions.ts, README.md, tsconfig.json, bun.lock + node_modules (bun install done).
- Start: `cd mini-services/session-service && bun run dev` (or `bun start`) → logs `beam session service listening on :3003`. Port 3003 hardcoded (no PORT env by design).
- Test results: 51/51 e2e assertions passed (/tmp/beam-test.ts), TTL-expiry live check passed, `bunx tsc --noEmit` clean.
- Deviations/notes for other agents: (1) HTTP listener created via node:http (Bun-native) instead of Bun.serve because engine.io must hook request/upgrade on the same port — plus a handleRequest patch so path:'/' doesn't swallow REST; (2) beam:ended / beam:expired / beam:error all carry `{code}` (or `{ok:false,code,message}`) payloads; (3) GET on an ended session → 410 `{code:'ENDED'}`; after the 10s sweeper reaps an expired session GET → 404 NOT_FOUND (both acceptable per spec); (4) oversized chunk → `beam:transfer:error {message:'Chunk too large'}` to sender; throttle → `{message:'Rate limited'}`; (5) beam:mode/manifest are host-only, beam:incoming guest-only, invalid payloads silently dropped; (6) beam:signal forwards `{signal}` verbatim (type offer/answer/candidate if present, ≤64 KB); (7) guest disconnect clears guestDevice in session views; slots free immediately on disconnect, zombie-socket takeover allowed; (8) ids are regenerated for files sent without a valid `id`.

---
Task ID: 2-b + 3 + 4 + 5 (main agent)
Agent: main (orchestrator)
Task: Client core, API routes, desktop UI, mobile view

Work Log:
- Built src/lib/beam/: protocol.ts, config.ts (env-driven STUN/TURN/signal URL), format.ts, api.ts, device.ts, history.ts (localStorage), files.ts (validation), webrtc.ts (DC helpers), engine.ts (zustand store + runtime: socket lifecycle, WebRTC offer/answer with 12s relay fallback, DC 16KB chunks w/ backpressure, WS relay 128KB chunks w/ 6-window acks, transfer queues per direction, progress/speed sampling).
- Built Next.js API: POST /api/sessions (validates + proxies to service + Prisma bookkeeping w/ SHA-256 token hash), GET /api/sessions/[code], POST /api/sessions/[code]/end. CRITICAL FIX: preserve client file ids (service regenerates ids not matching ^[A-Za-z0-9_-]{1,64}$ — dot in old `0-name` broke host/guest file mapping).
- Desktop UI: site-header/footer, landing (hero/how-it-works/features), dropzone (drag+paste+click), files card, QR card (qrcode lib, 'H' error correction, countdown, code chip, copy link, manual-key fallback), session dashboard (device/status/stats/end), transfers list, received files, terminal states (expired/ended/failed).
- Mobile view: all 11 states (opening/connecting/connected/lost/expired/invalid/ended/failed + download/upload flows), Download All, Camera capture input, Web Share API for saving.
- History + About views. History via useSyncExternalStore on localStorage.
- Fixed react-hooks lint (set-state-in-effect) with shared useCountdown hook + useSearchParams+Suspense in page.tsx. ESLint clean, tsc clean (own code).
- Started session service (bun run dev in mini-services/session-service, port 3003, log /tmp/beam-session-service.log).
- Verified REST chain via curl (create/validate/invalid-token 401).
- Wrote tests/beam-engine-e2e.ts — runs REAL engine as host in Bun + raw guest: session create → guest join → auto relay fallback → d2p 200KB chunk transfer (payload intact) → p2d 300KB transfer (byte-exact) → stats. ALL PASSED.
- Fixed api.ts BASE env bug found by the test (was hardcoded '').

Stage Summary:
- Full transfer pipeline is functional (relay path verified; WebRTC path uses same orchestration, needs browser-level check).
- window.__beam.getState() debug hook available for QA tooling.
- Next: agent-browser two-device verification + styling polish.

---
Task ID: 8 (E2E verification) — main agent
Agent: main (orchestrator)
Task: Browser-level two-device verification and bug fixing

Work Log:
- agent-browser E2E via Caddy gateway (localhost:81 — direct :3000 bypasses Caddy, so XTransformPort never reaches the service; preview URLs flow through the gateway so real users are unaffected).
- Fixed 3 real bugs found during verification:
  1. emitJoin deadlock: openSession pre-set joiningCode which the duplicate-guard in emitJoin then blocked → guest never emitted beam:join. Added separate joinSentFor guard; joiningCode now only guards openSession re-entry.
  2. zustand v5 selector crash: selectors returning fresh arrays (Object.values().filter()) caused "Maximum update depth exceeded" → white-screen crash on phone view. Fixed with stable transfers selector + useMemo.
  3. getServerSnapshot infinite-loop warning: history view now returns a module-level EMPTY constant.
- Service improvement: joining guest now receives beam:peer {joined, hostDevice} so the phone can show the real host device (was null).
- Browser-verified golden path: desktop session → phone tab joins → auto relay fallback (headless Chromium has no UDP/STUN — relay engaged exactly as designed) → phone downloads photo (byte-exact 120,006 B) → Download All (3/3) → phone uploads notes.txt → desktop "Incoming files" → Download → SHA-256 identical round trip.
- Verified UI states: landing hero, QR waiting (countdown/code/copy/manual fallback), connected dashboard (device/stats/End Session), transfers rows (P2P/Relay badges), phone connected banner, Saved states with share, invalid QR card w/ manual key entry, expired card w/ Create New Session (retry works — new session created), History (direction badges), About, dark mode (QR stays high-contrast on white), mobile 390×844 viewport.

Stage Summary:
- Desktop → QR → Phone → Download: WORKING (browser-verified).
- Phone → Upload → Desktop: WORKING (browser-verified).
- WebRTC path: same orchestration; in this sandbox headless env P2P can't connect (no UDP) so the automatic relay fallback covers it — on real networks with STUN/TURN env vars set, P2P engages first (code path shares request/start/chunk/done handlers; only the byte pipe differs).
- Remaining polish ideas for next iterations: subtle dropzone drag animations, skeleton loaders, PWA manifest, per-transfer retry on phone upload errors, sound/haptic cues, i18n.

---
Task ID: cron-review-1 (2026-09-04 ~02:00 IST)
Agent: main (orchestrator)
Task: QA sweep → critical relay flow-control bugfix → new features + styling details

Work Log (status → fix → features):
- STATUS: services healthy (:3000 dev, :3003 service via Caddy :81). QA smoke test passed (session→join→download, 0 console errors). Prior session logs showed a real user pair-up (4J3QZ3).
- CRITICAL BUG FIXED (relay flow control): sender's window counter over-counted when acks arrived before a waiter was registered (localhost bursts) → acks "lost" → 30s 'Transfer stalled' on multi-chunk files (>1 chunk = >128KB always failed beyond chunk 0; single-chunk files worked, which masked it). Fix: per-transfer TRUE unacked counter (relayInflight Map) decremented by EVERY ack + predicate-based waiters (waitRelayBelow(tid, threshold)); window-wait uses threshold=WINDOW, drain uses threshold=1. First attempt caused a microtask spin (immediate-resolve + wrong threshold) — caught by E2E within minutes, fixed with predicate re-check loop. Verified: E2E green + browser 2.2MB/17-chunk download done + 4-file batch (2.58GB total bytes verified, all done).
- SERVICE: fail-fast — relayToPeer=false now emits beam:transfer:error 'Other device disconnected' to sender (chunks/acks/start) instead of silent drop→stall. Debug logging added then removed (kept out of final).
- FEATURE: PWA — generated Beam icon (image-generation skill), sharp-resized icon set (192/512/512-maskable/apple-touch/favicon-32/48), public/manifest.webmanifest, layout metadata (manifest, appleWebApp, themeColor emerald).
- FEATURE: Download All aggregate batch progress bar on phone ('Downloading 3 of 4 · 1.9 MB / 2.5 MB') — verified live.
- FEATURE: WebAudio completion chime (chime.ts, gesture-primed, best-effort) on transfer done (send+receive); 'Phone connected' toast with device name on desktop.
- FEATURE: session-ending warning now at <2min (both QR card variants + phone header chip) with 'ending soon' guidance when paired.
- STYLING: QR scan-frame corner brackets (primary-emerald) around QR; animated progress-shine sweep on active transfer rows; dropzone drag glow (ring shadow + icon bounce + scale); hero dot-grid backdrop with radial mask.
- ENGINE QA instrumentation: window.__beam.debug {chunksHandled, noteProgressCalls, flushes, storeWrites} + storeId + version=2 (kept for future QA rounds).
- Environment notes: bun --hot in mini-service did NOT reload on file edits (2 edits missed) — restarted manually; keep in mind for future rounds (restart service after editing mini-services/session-service). agent-browser quirks: after close --all the fresh tab can reset to about:blank — re-navigating the existing tab is more reliable; only one heavy tab pair at a time (4GB RAM box, next-server holds ~1.5GB).

Stage Summary:
- Multi-chunk relay transfers now WORK end-to-end (previously >128KB always stalled) — this was the most important fix so far; P2P WebRTC path unaffected.
- All green: app lint+tsc clean, service tsc clean, E2E test green, browser batch verified.
- Next-round ideas (priority): drag-reorder selected files (dnd-kit), per-transfer retry button on phone for p2d errors (host side works), transfer speed sparkline, i18n skeleton, sound mute toggle, e2e for disconnect fail-fast path, consider chunk-size negotiation for WebRTC (16KB→64KB when both Chromium), scan-my-QR accessibility label test.
