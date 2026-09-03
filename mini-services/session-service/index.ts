/**
 * Beam session service — session registry + WebRTC signaling relay + chunk pipe.
 *
 * Single Bun process on :3003 (hardcoded by design — the Caddy gateway and the
 * Next.js app expect this port; the port is never put in the URL path).
 * REST and socket.io share ONE HTTP listener.
 *
 * Implementation note: socket.io v4 (engine.io) needs a node:http Server to
 * hook `request`/`upgrade`, so the listener is created with node's
 * createServer() — which Bun implements natively (same engine as Bun.serve).
 * Because the socket.io path is '/' (per protocol v1), engine.io's request
 * dispatcher would otherwise treat *every* URL as engine.io traffic; see
 * patchEngineIoRouting() below for how REST routes are preserved.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Server as SocketIOServer, type Socket } from 'socket.io'
import {
  ChunkThrottle,
  RateLimiter,
  SessionRegistry,
  isRecord,
  sanitizeDevice,
  validateFileManifest,
  type SessionRecord,
} from './sessions'
import { LIMITS, type BeamErrorCode, type DeviceInfo, type Role } from './protocol'

const PORT = 3003 // hardcoded per architecture (Caddy gateway rule)

const DEFAULT_TTL_MINUTES = 10
const MIN_TTL_MINUTES = 1
const MAX_TTL_MINUTES = 60

const MAX_CHUNK_BYTES = 256 * 1024 // server-side cap for beam:transfer:chunk
const CHUNK_TOKENS_PER_SEC = 3000 // per-socket token-bucket refill
const MAX_SIGNAL_BYTES = 64 * 1024 // serialized SDP/ICE guard
const MAX_JSON_BODY_BYTES = 512 * 1024
const MAX_TRANSFER_ID_LENGTH = 64
const MAX_SHORT_STRING = 256

const CREATE_RATE_LIMIT = { limit: 12, windowMs: 60_000 } // POST /sessions per IP
const READ_RATE_LIMIT = { limit: 30, windowMs: 60_000 } // GET + POST end per IP
const JOIN_RATE_LIMIT = { limit: 20, windowMs: 60_000 } // beam:join per IP
const SWEEP_INTERVAL_MS = 10_000

// ---------------------------------------------------------------------------
// CORS (REST) — default '*', restrict with ALLOWED_ORIGINS="a,b,c"
// ---------------------------------------------------------------------------

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const allowAllOrigins = allowedOrigins.length === 0 || allowedOrigins.includes('*')

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  if (allowAllOrigins) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    return
  }
  const origin = req.headers.origin
  if (typeof origin === 'string' && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const registry = new SessionRegistry()
const createLimiter = new RateLimiter(CREATE_RATE_LIMIT.limit, CREATE_RATE_LIMIT.windowMs)
const readLimiter = new RateLimiter(READ_RATE_LIMIT.limit, READ_RATE_LIMIT.windowMs)
const joinLimiter = new RateLimiter(JOIN_RATE_LIMIT.limit, JOIN_RATE_LIMIT.windowMs)
const chunkThrottle = new ChunkThrottle(CHUNK_TOKENS_PER_SEC)

/** socket.id → joined session context. Membership in the socket.io room is implied. */
const socketSessions = new Map<string, { code: string; role: Role; device: DeviceInfo }>()

// ---------------------------------------------------------------------------
// HTTP server + socket.io on the SAME listener
// ---------------------------------------------------------------------------

const server = createServer((req, res) => {
  void restHandler(req, res)
})

const io = new SocketIOServer(server, {
  path: '/',
  cors: allowAllOrigins ? { origin: '*', methods: ['GET', 'POST'] } : { origin: allowedOrigins, methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
  maxHttpBufferSize: 2_000_000,
})

/**
 * socket.io is configured with path: '/' (protocol v1). engine.io decides
 * "is this an engine.io request" purely by URL prefix, so with path '/' it
 * would swallow the REST routes and answer them with 400s. The dispatcher
 * delegates to engine.handleRequest, so we wrap it: requests that look like
 * engine.io traffic (EIO/transport query params) go to engine.io, everything
 * else goes to the REST handler. WebSocket upgrades always carry EIO params
 * and are handled by engine.io's 'upgrade' hook, which is untouched.
 */
function patchEngineIoRouting(): void {
  const engine = io.engine as unknown as {
    handleRequest: (req: IncomingMessage, res: ServerResponse) => void
  }
  const engineHandleRequest = engine.handleRequest.bind(engine)
  engine.handleRequest = (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? ''
    if (url.includes('EIO=') || url.includes('transport=')) {
      engineHandleRequest(req, res)
    } else {
      void restHandler(req, res)
    }
  }
}
patchEngineIoRouting()

io.engine.on('connection_error', (err: { code: number; message: string }) => {
  console.log(`[beam] ws handshake rejected code=${err.code} reason=${err.message}`)
})

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const isLive = (socketId: string | null): boolean =>
  socketId !== null && io.sockets.sockets.has(socketId)

function sessionView(session: SessionRecord) {
  return registry.view(session, isLive)
}

function emitSocketError(socket: Socket, code: BeamErrorCode, message: string): void {
  socket.emit('beam:error', { ok: false, code, message })
}

function clientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  } else if (Array.isArray(xff) && xff.length > 0) {
    const first = xff[0]?.split(',')[0]?.trim()
    if (first) return first
  }
  return req.socket.remoteAddress ?? 'unknown'
}

function socketIp(socket: Socket): string {
  const xff = socket.handshake.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return socket.handshake.address ?? 'unknown'
}

function normCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[0-9A-Z]{6}$/.test(code) ? code : null
}

function codeFromParam(raw: string): string | null {
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }
  return normCode(decoded)
}

function validTransferId(value: unknown): string | null {
  return typeof value === 'string' && value.length >= 1 && value.length <= MAX_TRANSFER_ID_LENGTH
    ? value
    : null
}

function validShortString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length >= 1 && value.length <= max ? value : null
}

function validSeq(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
}

function validDirection(value: unknown): value is 'd2p' | 'p2d' {
  return value === 'd2p' || value === 'p2d'
}

function validMode(value: unknown): value is 'webrtc' | 'relay' {
  return value === 'webrtc' || value === 'relay'
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : (chunk as Buffer)
    total += buf.length
    if (total > maxBytes) throw new Error('payload too large')
    chunks.push(buf)
  }
  if (total === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(req: IncomingMessage, res: ServerResponse, status: number, body: unknown): void {
  applyCors(req, res)
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(payload)
}

function respondPreflight(req: IncomingMessage, res: ServerResponse): void {
  applyCors(req, res)
  res.writeHead(204, {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? 'Content-Type',
    'Access-Control-Max-Age': '600',
  })
  res.end()
}

/** Forwards an event to the other peer of the sender's session. */
function relayToPeer(socket: Socket, event: string, payload: unknown): boolean {
  const ctx = socketSessions.get(socket.id)
  if (!ctx) return false
  const session = registry.get(ctx.code)
  if (!session) return false
  const peerId = ctx.role === 'host' ? session.guestSocketId : session.hostSocketId
  if (!peerId || !io.sockets.sockets.has(peerId)) return false
  io.to(peerId).emit(event, payload)
  return true
}

/** Marks a session ended, notifies both peers, and tears down the room. */
function endSessionByCode(code: string): boolean {
  const session = registry.get(code)
  if (!session) return false
  session.status = 'ended'
  io.to(code).emit('beam:ended', { code })
  destroyRoom(code)
  session.hostSocketId = null
  session.guestSocketId = null
  session.guestDevice = null
  console.log(`[beam] session ended code=${code}`)
  return true
}

/** Removes all sockets of a session from the room + internal maps. */
function destroyRoom(code: string): void {
  for (const [socketId, ctx] of [...socketSessions]) {
    if (ctx.code !== code) continue
    socketSessions.delete(socketId)
    chunkThrottle.drop(socketId)
    const s = io.sockets.sockets.get(socketId)
    if (s) s.leave(code)
  }
}

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------

async function restHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
    const method = req.method ?? 'GET'
    const pathname = url.pathname

    if (method === 'OPTIONS') {
      respondPreflight(req, res)
      return
    }

    if (method === 'POST' && pathname === '/sessions') {
      await handleCreateSession(req, res)
      return
    }

    const endMatch = pathname.match(/^\/sessions\/([^/]+)\/end$/)
    if (method === 'POST' && endMatch) {
      await handleEndSession(req, res, url, endMatch[1]!)
      return
    }

    const getMatch = pathname.match(/^\/sessions\/([^/]+)$/)
    if (method === 'GET' && getMatch) {
      await handleGetSession(req, res, url, getMatch[1]!)
      return
    }

    sendJson(req, res, 404, { ok: false, code: 'NOT_FOUND', message: 'Unknown route' })
  } catch (err) {
    console.error('[beam] REST error:', err)
    if (!res.headersSent) {
      sendJson(req, res, 500, { ok: false, code: 'INTERNAL', message: 'Internal server error' })
    } else {
      res.destroy()
    }
  }
}

async function handleCreateSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ip = clientIp(req)
  if (!createLimiter.check(`create:${ip}`)) {
    sendJson(req, res, 429, {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many sessions created, try again in a minute',
    })
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(req, MAX_JSON_BODY_BYTES)
  } catch {
    sendJson(req, res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Invalid or oversized JSON body' })
    return
  }
  if (!isRecord(body)) {
    sendJson(req, res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Body must be a JSON object' })
    return
  }
  const validated = validateFileManifest(body.files)
  if (!validated.ok) {
    sendJson(req, res, 400, { ok: false, code: 'BAD_REQUEST', message: validated.error })
    return
  }

  let ttlMinutes = DEFAULT_TTL_MINUTES
  if (body.ttlMinutes !== undefined) {
    if (typeof body.ttlMinutes !== 'number' || !Number.isFinite(body.ttlMinutes)) {
      sendJson(req, res, 400, { ok: false, code: 'BAD_REQUEST', message: 'ttlMinutes must be a number' })
      return
    }
    ttlMinutes = Math.min(MAX_TTL_MINUTES, Math.max(MIN_TTL_MINUTES, Math.round(body.ttlMinutes)))
  }

  const { session, token } = await registry.create(validated.files, ttlMinutes)
  console.log(`[beam] session created code=${session.code} ttl=${ttlMinutes}m files=${validated.files.length}`)
  // Token is returned exactly ONCE — it is only stored as a SHA-256 hash.
  sendJson(req, res, 200, { code: session.code, token, expiresAt: session.expiresAt })
}

async function handleGetSession(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  rawCode: string,
): Promise<void> {
  const ip = clientIp(req)
  if (!readLimiter.check(`read:${ip}`)) {
    sendJson(req, res, 429, { ok: false, code: 'RATE_LIMITED', message: 'Too many requests, try again in a minute' })
    return
  }
  const code = codeFromParam(rawCode)
  if (!code) {
    sendJson(req, res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Malformed session code' })
    return
  }
  const session = registry.get(code)
  if (!session) {
    sendJson(req, res, 404, { ok: false, code: 'NOT_FOUND', message: 'Session not found' })
    return
  }
  if (Date.now() >= session.expiresAt) {
    destroyRoom(code)
    registry.delete(code)
    sendJson(req, res, 410, { ok: false, code: 'EXPIRED', message: 'Session expired' })
    return
  }
  if (session.status === 'ended') {
    sendJson(req, res, 410, { ok: false, code: 'ENDED', message: 'Session has ended' })
    return
  }
  const token = url.searchParams.get('token') ?? ''
  if (!token || !(await registry.verifyToken(session, token))) {
    sendJson(req, res, 401, { ok: false, code: 'INVALID_TOKEN', message: 'Invalid or missing token' })
    return
  }
  sendJson(req, res, 200, { ok: true, session: sessionView(session) })
}

async function handleEndSession(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  rawCode: string,
): Promise<void> {
  const ip = clientIp(req)
  if (!readLimiter.check(`read:${ip}`)) {
    sendJson(req, res, 429, { ok: false, code: 'RATE_LIMITED', message: 'Too many requests, try again in a minute' })
    return
  }
  const code = codeFromParam(rawCode)
  if (!code) {
    sendJson(req, res, 400, { ok: false, code: 'BAD_REQUEST', message: 'Malformed session code' })
    return
  }
  const session = registry.get(code)
  if (!session) {
    sendJson(req, res, 404, { ok: false, code: 'NOT_FOUND', message: 'Session not found' })
    return
  }
  if (Date.now() >= session.expiresAt) {
    destroyRoom(code)
    registry.delete(code)
    sendJson(req, res, 410, { ok: false, code: 'EXPIRED', message: 'Session expired' })
    return
  }
  const token = url.searchParams.get('token') ?? ''
  if (!token || !(await registry.verifyToken(session, token))) {
    sendJson(req, res, 401, { ok: false, code: 'INVALID_TOKEN', message: 'Invalid or missing token' })
    return
  }
  endSessionByCode(code)
  sendJson(req, res, 200, { ok: true })
}

// ---------------------------------------------------------------------------
// Socket.io events (protocol v1)
// ---------------------------------------------------------------------------

/** Runs every event handler inside try/catch — malformed input can never crash the process. */
function registerEvent(socket: Socket, event: string, handler: (payload: unknown) => void | Promise<void>): void {
  socket.on(event, (payload: unknown) => {
    try {
      const result = handler(payload)
      if (result instanceof Promise) {
        result.catch((err) => console.error(`[beam] handler error event=${event} socket=${socket.id}:`, err))
      }
    } catch (err) {
      console.error(`[beam] handler error event=${event} socket=${socket.id}:`, err)
    }
  })
}

io.on('connection', (socket) => {
  registerEvent(socket, 'beam:join', (p) => handleBeamJoin(socket, p))
  registerEvent(socket, 'beam:signal', (p) => handleBeamSignal(socket, p))
  registerEvent(socket, 'beam:mode', (p) => handleBeamMode(socket, p))
  registerEvent(socket, 'beam:manifest', (p) => handleBeamManifest(socket, p))
  registerEvent(socket, 'beam:incoming', (p) => handleBeamIncoming(socket, p))
  registerEvent(socket, 'beam:transfer:request', (p) => handleTransferRequest(socket, p))
  registerEvent(socket, 'beam:transfer:start', (p) => handleTransferStart(socket, p))
  registerEvent(socket, 'beam:transfer:chunk', (p) => handleTransferChunk(socket, p))
  registerEvent(socket, 'beam:transfer:ack', (p) => handleTransferAck(socket, p))
  registerEvent(socket, 'beam:transfer:done', (p) => handleTransferDone(socket, p))
  registerEvent(socket, 'beam:transfer:cancel', (p) => handleTransferCancel(socket, p))
  registerEvent(socket, 'beam:transfer:error', (p) => handleTransferError(socket, p))
  registerEvent(socket, 'beam:end', (p) => handleBeamEnd(socket, p))

  socket.on('disconnect', () => handleDisconnect(socket))
})

async function handleBeamJoin(socket: Socket, payload: unknown): Promise<void> {
  // 1) Rate limit first — even malformed spam counts against the IP budget.
  if (!joinLimiter.check(`join:${socketIp(socket)}`)) {
    emitSocketError(socket, 'RATE_LIMITED', 'Too many join attempts, try again in a minute')
    return
  }

  // 2) Payload shape.
  if (!isRecord(payload)) {
    emitSocketError(socket, 'BAD_REQUEST', 'Invalid join payload')
    return
  }
  const code = normCode(payload.code)
  const role: Role | null = payload.role === 'host' || payload.role === 'guest' ? payload.role : null
  const token =
    typeof payload.token === 'string' && payload.token.length >= 1 && payload.token.length <= 128
      ? payload.token
      : null
  if (!code || !token || !role) {
    emitSocketError(socket, 'BAD_REQUEST', 'code, token and role are required')
    return
  }
  const device = sanitizeDevice(payload.device)

  // 3) Session state.
  const session = registry.get(code)
  if (!session) {
    emitSocketError(socket, 'NOT_FOUND', 'Session not found')
    return
  }
  if (Date.now() >= session.expiresAt) {
    destroyRoom(code)
    registry.delete(code)
    emitSocketError(socket, 'EXPIRED', 'Session expired')
    return
  }
  if (session.status === 'ended') {
    emitSocketError(socket, 'ENDED', 'Session has ended')
    return
  }
  if (!(await registry.verifyToken(session, token))) {
    emitSocketError(socket, 'INVALID_TOKEN', 'Invalid session token')
    return
  }

  // 4) Idempotent re-join by the same socket (same code + role) is allowed.
  const existing = socketSessions.get(socket.id)
  if (existing && existing.code === code && existing.role === role) {
    socket.emit('beam:joined', { ok: true, role, session: sessionView(session), yourDevice: device })
    return
  }

  // 5) Role slot must be free. A slot occupied by a DEAD socket may be taken
  //    over (host/guest reconnect within the same session).
  const slotOccupant = role === 'host' ? session.hostSocketId : session.guestSocketId
  if (slotOccupant && slotOccupant !== socket.id && io.sockets.sockets.has(slotOccupant)) {
    emitSocketError(socket, 'ROLE_TAKEN', `The ${role} slot is already occupied`)
    return
  }

  // 6) If this socket was previously joined to another session, release it.
  if (existing) releaseSocket(socket.id, existing)

  // 7) Attach.
  if (role === 'host') {
    session.hostSocketId = socket.id
  } else {
    session.guestSocketId = socket.id
    session.guestDevice = device
  }
  socketSessions.set(socket.id, { code, role, device })
  socket.join(code)

  socket.emit('beam:joined', { ok: true, role, session: sessionView(session), yourDevice: device })

  // 8) Notify the other peer.
  const peerId = role === 'host' ? session.guestSocketId : session.hostSocketId
  if (peerId && peerId !== socket.id && io.sockets.sockets.has(peerId)) {
    io.to(peerId).emit('beam:peer', { event: 'joined', device })
  }
  // 9) A joining guest also learns about the already-present host (device info).
  if (role === 'guest' && session.hostSocketId && session.hostSocketId !== socket.id) {
    const hostCtx = socketSessions.get(session.hostSocketId)
    if (hostCtx) socket.emit('beam:peer', { event: 'joined', device: hostCtx.device })
  }
  console.log(`[beam] peer joined code=${code} role=${role}`)
}

function releaseSocket(socketId: string, ctx: { code: string; role: Role }): void {
  const session = registry.get(ctx.code)
  if (!session) return
  if (ctx.role === 'host' && session.hostSocketId === socketId) {
    session.hostSocketId = null
  } else if (ctx.role === 'guest' && session.guestSocketId === socketId) {
    session.guestSocketId = null
    session.guestDevice = null
  }
  const s = io.sockets.sockets.get(socketId)
  if (s) s.leave(ctx.code)
}

function handleDisconnect(socket: Socket): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx) return
  socketSessions.delete(socket.id)
  chunkThrottle.drop(socket.id)
  const session = registry.get(ctx.code)
  if (!session) return
  if (ctx.role === 'host' && session.hostSocketId === socket.id) {
    session.hostSocketId = null
  } else if (ctx.role === 'guest' && session.guestSocketId === socket.id) {
    session.guestSocketId = null
    session.guestDevice = null
  } else {
    return // slot was taken over or already cleared — nothing to announce
  }
  // Keep the session alive until expiry so the peer can rejoin.
  const peerId = ctx.role === 'host' ? session.guestSocketId : session.hostSocketId
  if (peerId && io.sockets.sockets.has(peerId)) {
    io.to(peerId).emit('beam:peer', { event: 'left', device: null })
  }
  console.log(`[beam] peer left code=${ctx.code} role=${ctx.role}`)
}

function handleBeamSignal(socket: Socket, payload: unknown): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx || !isRecord(payload)) return
  const code = normCode(payload.code)
  if (!code || code !== ctx.code) return
  const signal = payload.signal
  if (!isRecord(signal)) return
  // Accept {type,payload} SDP-ish objects and {type:'candidate',...} ICE;
  // reject unknown types and oversized bodies. Forwarded verbatim.
  if (
    signal.type !== undefined &&
    signal.type !== 'offer' &&
    signal.type !== 'answer' &&
    signal.type !== 'candidate'
  ) {
    return
  }
  if (JSON.stringify(signal).length > MAX_SIGNAL_BYTES) return
  relayToPeer(socket, 'beam:signal', { signal })
}

function handleBeamMode(socket: Socket, payload: unknown): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx || !isRecord(payload)) return
  const code = normCode(payload.code)
  if (!code || code !== ctx.code) return
  if (ctx.role !== 'host') return // host only
  if (!validMode(payload.mode)) return
  relayToPeer(socket, 'beam:mode', { mode: payload.mode })
}

function handleBeamManifest(socket: Socket, payload: unknown): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx || !isRecord(payload)) return
  const code = normCode(payload.code)
  if (!code || code !== ctx.code) return
  if (ctx.role !== 'host') return // host only
  const validated = validateFileManifest(payload.files)
  if (!validated.ok) return
  const session = registry.get(ctx.code)
  if (!session) return
  session.manifest = validated.files // stored so late-joining guests see it
  relayToPeer(socket, 'beam:manifest', { files: validated.files })
}

function handleBeamIncoming(socket: Socket, payload: unknown): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx || !isRecord(payload)) return
  const code = normCode(payload.code)
  if (!code || code !== ctx.code) return
  if (ctx.role !== 'guest') return // guest only
  const validated = validateFileManifest(payload.files)
  if (!validated.ok) return
  relayToPeer(socket, 'beam:incoming', { files: validated.files }) // no storage
}

function handleTransferRequest(socket: Socket, payload: unknown): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx || !isRecord(payload)) return
  const code = normCode(payload.code)
  if (!code || code !== ctx.code) return
  const transferId = validTransferId(payload.transferId)
  const fileId = validShortString(payload.fileId, 128)
  if (!transferId || !fileId || !validDirection(payload.direction)) return
  relayToPeer(socket, 'beam:transfer:request', {
    code,
    transferId,
    fileId,
    direction: payload.direction,
  })
}

function handleTransferStart(socket: Socket, payload: unknown): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx || !isRecord(payload)) return
  const code = normCode(payload.code)
  if (!code || code !== ctx.code) return
  const transferId = validTransferId(payload.transferId)
  if (!transferId || !validDirection(payload.direction)) return
  const file = payload.file
  if (!isRecord(file)) return
  const name = file.name
  if (typeof name !== 'string' || name.length < 1 || name.length > 255) return
  const size = file.size
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0 || size > LIMITS.MAX_FILE_BYTES) return
  if (file.id !== undefined && (typeof file.id !== 'string' || file.id.length > 64)) return
  const ok = relayToPeer(socket, 'beam:transfer:start', { code, transferId, file, direction: payload.direction })
  if (!ok) {
    socket.emit('beam:transfer:error', { code, transferId, message: 'Other device disconnected — reconnect and retry' })
  }
}

function handleTransferChunk(socket: Socket, payload: unknown): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx || !isRecord(payload)) return
  const code = normCode(payload.code)
  if (!code || code !== ctx.code) return
  const transferId = validTransferId(payload.transferId)
  if (!transferId) return
  if (!validSeq(payload.seq)) return
  const data: unknown = payload.data
  const isBinary = data instanceof ArrayBuffer || ArrayBuffer.isView(data)
  if (!isBinary) return // must be ArrayBuffer/Uint8Array
  const byteLength = (data as ArrayBuffer | ArrayBufferView).byteLength
  if (byteLength > MAX_CHUNK_BYTES) {
    socket.emit('beam:transfer:error', { code, transferId, message: 'Chunk too large' })
    return
  }
  if (!chunkThrottle.allow(socket.id)) {
    socket.emit('beam:transfer:error', { code, transferId, message: 'Rate limited' })
    return
  }
  const ok = relayToPeer(socket, 'beam:transfer:chunk', { code, transferId, seq: payload.seq, data })
  if (!ok) {
    // Peer is gone — fail fast instead of letting the sender stall on acks.
    socket.emit('beam:transfer:error', { code, transferId, message: 'Other device disconnected — reconnect and retry' })
  }
}

function handleTransferAck(socket: Socket, payload: unknown): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx || !isRecord(payload)) return
  const code = normCode(payload.code)
  if (!code || code !== ctx.code) return
  const transferId = validTransferId(payload.transferId)
  if (!transferId || !validSeq(payload.seq)) return
  const ok = relayToPeer(socket, 'beam:transfer:ack', { code, transferId, seq: payload.seq })
  if (!ok) {
    socket.emit('beam:transfer:error', { code, transferId, message: 'Other device disconnected — reconnect and retry' })
  }
}

function handleTransferDone(socket: Socket, payload: unknown): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx || !isRecord(payload)) return
  const code = normCode(payload.code)
  if (!code || code !== ctx.code) return
  const transferId = validTransferId(payload.transferId)
  if (!transferId) return
  relayToPeer(socket, 'beam:transfer:done', { code, transferId })
}

function handleTransferCancel(socket: Socket, payload: unknown): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx || !isRecord(payload)) return
  const code = normCode(payload.code)
  if (!code || code !== ctx.code) return
  const transferId = validTransferId(payload.transferId)
  if (!transferId) return
  const out: Record<string, unknown> = { code, transferId }
  if (payload.reason !== undefined) {
    const reason = validShortString(payload.reason, MAX_SHORT_STRING)
    if (!reason) return
    out.reason = reason
  }
  relayToPeer(socket, 'beam:transfer:cancel', out)
}

function handleTransferError(socket: Socket, payload: unknown): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx || !isRecord(payload)) return
  const code = normCode(payload.code)
  if (!code || code !== ctx.code) return
  const transferId = validTransferId(payload.transferId)
  const message = validShortString(payload.message, MAX_SHORT_STRING)
  if (!transferId || !message) return
  relayToPeer(socket, 'beam:transfer:error', { code, transferId, message })
}

function handleBeamEnd(socket: Socket, payload: unknown): void {
  const ctx = socketSessions.get(socket.id)
  if (!ctx || !isRecord(payload)) return
  const code = normCode(payload.code)
  if (!code || code !== ctx.code) return
  endSessionByCode(code) // either peer may end the session
}

// ---------------------------------------------------------------------------
// TTL sweeper
// ---------------------------------------------------------------------------

function sweep(): void {
  const now = Date.now()
  for (const session of [...registry.all()]) {
    if (now >= session.expiresAt) {
      console.log(`[beam] session expired code=${session.code}`)
      io.to(session.code).emit('beam:expired', { code: session.code })
      destroyRoom(session.code)
      registry.delete(session.code)
      continue
    }
    // Safety net: peerless sessions are reaped after 2× their TTL.
    if (
      now >= session.createdAt + 2 * session.ttlMs &&
      !isLive(session.hostSocketId) &&
      !isLive(session.guestSocketId)
    ) {
      console.log(`[beam] session reaped code=${session.code} (no peers after 2x TTL)`)
      destroyRoom(session.code)
      registry.delete(session.code)
    }
  }
  createLimiter.sweep()
  readLimiter.sweep()
  joinLimiter.sweep()
}

const sweeper = setInterval(sweep, SWEEP_INTERVAL_MS)
sweeper.unref?.()

// ---------------------------------------------------------------------------
// Start + graceful shutdown
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log('beam session service listening on :3003')
})

let shuttingDown = false
function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[beam] ${signal} received, shutting down`)
  clearInterval(sweeper)
  io.disconnectSockets(true)
  io.close(() => process.exit(0))
  server.close(() => undefined)
  setTimeout(() => process.exit(0), 2000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('uncaughtException', (err) => console.error('[beam] uncaught exception:', err))
process.on('unhandledRejection', (reason) => console.error('[beam] unhandled rejection:', reason))
