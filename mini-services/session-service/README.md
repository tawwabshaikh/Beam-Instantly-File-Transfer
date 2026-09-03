# beam-session-service

Beam's signaling + relay microservice: session registry (in-memory, TTL-swept),
WebRTC signaling relay, and the relay chunk-pipe fallback. **Files are never
stored on the server — it is a pure pipe.**

- Runtime: **Bun** (≥ 1.1), TypeScript strict
- Port: **3003** — hardcoded by design (the Next.js app and the Caddy gateway
  expect it; the port is never placed in the URL path)
- REST + socket.io share **one HTTP listener** on that port

## Quick start

```bash
cd mini-services/session-service
bun install
bun run dev     # bun --hot index.ts (dev, auto-reload)
bun start       # bun index.ts (production / orchestrator)
```

Startup log line: `beam session service listening on :3003`.

## Environment variables

| Variable          | Default | Description                                                             |
| ----------------- | ------- | ----------------------------------------------------------------------- |
| `ALLOWED_ORIGINS` | `*`     | Comma-separated origin allowlist for REST CORS + socket.io CORS. Set to e.g. `https://beam.example.com,https://phone.example.com`. |

There is intentionally **no `PORT` env** — port 3003 is hardcoded (orchestrator +
Caddy `XTransformPort=3003` gateway rule). Session limits (20 files, 2 GB/file,
4 GB total, chunk ≤ 256 KB, 3000 chunks/s/socket) match
`src/lib/beam/protocol.ts` `LIMITS` and are constants on purpose.

## REST API

All responses are JSON; errors use `{ ok: false, code, message }` with codes
`NOT_FOUND | EXPIRED | ENDED | INVALID_TOKEN | RATE_LIMITED | BAD_REQUEST | INTERNAL`.
CORS: `Access-Control-Allow-Origin: *` by default (`ALLOWED_ORIGINS` to restrict);
`OPTIONS` preflight handled on all routes.

### `POST /sessions`
```bash
curl -s -X POST http://localhost:3003/sessions \
  -H 'content-type: application/json' \
  -d '{"files":[{"id":"f1","name":"photo.jpg","size":12345,"type":"image/jpeg"}],"ttlMinutes":10}'
# → 200 { "code": "K7Q2MA", "token": "H9XK2M4A7QPB", "expiresAt": 1730000000000 }
```
- Body: `{ files: FileMeta[], ttlMinutes? }` — 1..20 files, each 1 B..2 GB,
  total ≤ 4 GB; names are sanitized (path separators stripped, ≤ 255 chars).
- `ttlMinutes`: default 10, clamped to 1..60.
- `code` = 6 chars, `token` = 12 chars, both from Crockford base32 without
  ambiguous chars (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`).
- The token is returned **exactly once**; the service only stores its SHA-256 hash.
- Rate limit: **12 creates / min / IP** → `429 RATE_LIMITED`.

### `GET /sessions/:code?token=…`
```bash
curl -s "http://localhost:3003/sessions/K7Q2MA?token=H9XK2M4A7QPB"
# → 200 { ok: true, session: { code, expiresAt, status, fileManifest, hostConnected, guestConnected, guestDevice } }
# → 404 NOT_FOUND | 410 EXPIRED | 410 ENDED | 401 INVALID_TOKEN
```
Rate limit: **30 / min / IP** (shared with the `end` route).

### `POST /sessions/:code/end?token=…`
Marks the session `ended`, emits `beam:ended` to both peers, destroys the room.
Idempotent while the session record still exists. → `{ ok: true }`.

## Socket protocol v1 (socket.io, path `/`)

Client → server:
`beam:join {code,token,role,device}` · `beam:signal {code,signal}` ·
`beam:mode {code,mode}` (host only) · `beam:manifest {code,files}` (host only, stored) ·
`beam:incoming {code,files}` (guest only, relayed) ·
`beam:transfer:request|start|chunk|ack|done|cancel|error` (relay pipe; `data`
must be ArrayBuffer/Uint8Array ≤ 256 KB) · `beam:note {code,text}` (≤ 20 000 chars,
relayed verbatim to the peer, never stored) · `beam:extend {code}` (host only) ·
`beam:end {code}` (either peer).

Server → client:
`beam:joined {ok:true,role,session,yourDevice}` · `beam:error {ok:false,code,message}` ·
`beam:peer {event:'joined'|'left',device}` · `beam:signal {signal}` · `beam:mode {mode}` ·
`beam:manifest {files}` · `beam:incoming {files}` · all `beam:transfer:*` forwarded to the peer ·
`beam:note {text,from,at}` · `beam:note:error {code,message}` (peer gone — note not delivered) ·
`beam:extended {code,expiresAt}` (room-wide; expiry reset to a full TTL) ·
`beam:extend:declined {code,message}` (sender outside the extend window) ·
`beam:ended {code}` · `beam:expired {code}`.

- `beam:error` codes: `NOT_FOUND | EXPIRED | ENDED | INVALID_TOKEN | ROLE_TAKEN | RATE_LIMITED | BAD_REQUEST`.
  Join rate limit: **20 joins / min / IP**.
- Extend window: a host may reset `expiresAt` to `now + ttl` only when the
  session is inside its extend window — `min(EXTEND_WINDOW_MS, ttl/3)` (5 min
  cap, scaled down for short TTLs via `extendWindowFor`); earlier attempts
  get `beam:extend:declined`, guest attempts are ignored.
- Notes: whitespace/control chars stripped, capped at `LIMITS.MAX_NOTE_CHARS`
  (20 000); empty/oversized notes are silently dropped; if the peer socket is
  gone the sender receives `beam:note:error`.
- Chunk throttle: token bucket ≈ **3000 chunks/s per socket**; over-throttle
  chunks are dropped and the sender gets `beam:transfer:error {message:'Rate limited'}`.
  Oversized chunks (>` 256 KB`) get `{message:'Chunk too large'}`. Chunks are never logged.
- Invalid payloads on other events are silently dropped.
- Disconnect frees the peer slot and emits `beam:peer {event:'left',device:null}`
  to the remaining peer; the session stays joinable until it expires.
- Sweeper runs every 10 s: expired sessions emit `beam:expired`, destroy rooms,
  get deleted; peerless sessions are reaped after 2× TTL.

## Security notes

- Tokens only compared as SHA-256 hashes (Web Crypto, timing-safe compare); never logged.
- `X-Forwarded-For` (first entry) is trusted for rate-limit keys, falling back to
  the socket/remote address — put the service behind exactly one trusted proxy.
- Every socket payload is type/size/length validated before relay.

## Production deployment

### Reverse proxy
Terminate TLS at Caddy/nginx and forward WebSocket upgrades:
```
# Caddy (Z.ai sandbox style)
:80 {
  handle_path /api/* { ... }
  @ws query XTransformPort=3003
  handle @ws { reverse_proxy 127.0.0.1:3003 }   # client: io('/?XTransformPort=3003', { path: '/' })
}
```
```
# nginx equivalent
location / {
  proxy_pass http://127.0.0.1:3003;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

### TURN
WebRTC needs TURN for symmetric-NAT / mobile-carrier peers (STUN alone is not
enough for ~15% of pairs). Run coturn (or use a managed service like
Twilio/Xirsys/Metered) and configure the **client** (this service only relays
signaling, it never sees media):
```
NEXT_PUBLIC_TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349
NEXT_PUBLIC_TURN_USERNAME=beam
NEXT_PUBLIC_TURN_CREDENTIAL=***
```
Use short-lived ephemeral TURN credentials (HMAC of the username) rather than
static ones in production.

### Horizontal scaling — ⚠️ NOT supported
All state (sessions, slots, rate-limit windows, throttle buckets) is **in-memory
per process**. Run exactly **one instance** of this service. Scaling out requires
sticky sessions *and* moving the registry into Redis/Postgres — out of scope for
v1; if you must scale, shard by session code at the gateway instead.

## Dev notes

- `bun run typecheck` — `tsc --noEmit` (strict).
- Graceful SIGINT/SIGTERM: sockets disconnected, server closed, process exits.
- A temporary end-to-end smoke test lives at `/tmp/beam-test.ts` (created during
  development; not shipped) — happy path, signaling, chunk pipe, rate limits.
