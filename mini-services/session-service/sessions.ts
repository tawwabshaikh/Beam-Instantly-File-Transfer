/**
 * Beam session registry, rate limiting, and payload validators.
 *
 * Everything here is in-memory: sessions live for the process lifetime and are
 * cleaned up by the TTL sweeper in index.ts. Session tokens are only ever
 * stored as SHA-256 hex hashes (never logged, returned to the client exactly
 * once at creation time).
 */

import { LIMITS, type DeviceInfo, type FileMeta } from './protocol'

/** Crockford base32 minus ambiguous characters (0/O and 1/I/L). */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export const CODE_LENGTH = 6
export const TOKEN_LENGTH = 12

export type SessionStatus = 'active' | 'ended'

export interface SessionRecord {
  code: string
  /** SHA-256 hex of the session token — the raw token is never stored. */
  tokenHash: string
  createdAt: number
  expiresAt: number
  ttlMs: number
  status: SessionStatus
  manifest: FileMeta[]
  hostSocketId: string | null
  guestSocketId: string | null
  guestDevice: DeviceInfo | null
}

export interface SessionPublicView {
  code: string
  expiresAt: number
  status: SessionStatus
  fileManifest: FileMeta[]
  hostConnected: boolean
  guestConnected: boolean
  guestDevice: DeviceInfo | null
}

// ---------------------------------------------------------------------------
// Random codes / token hashing
// ---------------------------------------------------------------------------

/**
 * Crypto-random string from the unambiguous base32 alphabet.
 * The alphabet is 32 chars and a byte is 256 values (256 % 32 === 0), so the
 * modulo introduces zero bias.
 */
export function randomCode(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

/** SHA-256 of a string as lowercase hex (Web Crypto). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string comparison (for token hashes). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/** Strips path separators / control characters, caps at 255 chars. */
export function sanitizeFileName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let name = raw.replace(/\\/g, '/').split('/').pop() ?? ''
  name = name.replace(CONTROL_CHARS, '').trim()
  if (!name || name === '.' || name === '..') return null
  return name.length > 255 ? name.slice(0, 255) : name
}

/** Coerces an untrusted device object into a safe DeviceInfo (never null). */
export function sanitizeDevice(raw: unknown): DeviceInfo {
  const rec = isRecord(raw) ? raw : {}
  const platform =
    typeof rec.platform === 'string' && rec.platform.trim()
      ? rec.platform.trim().slice(0, 64)
      : 'unknown'
  const browser =
    typeof rec.browser === 'string' && rec.browser.trim()
      ? rec.browser.trim().slice(0, 64)
      : 'unknown'
  return { platform, browser, isMobile: rec.isMobile === true }
}

export type FileValidation = { ok: true; files: FileMeta[] } | { ok: false; error: string }

/**
 * Validates a file manifest: 1..20 entries, each 1 byte..2 GB, total ≤ 4 GB,
 * names sanitized (no path separators, ≤ 255 chars). Missing / duplicate /
 * malformed ids are regenerated server-side.
 */
export function validateFileManifest(input: unknown): FileValidation {
  if (!Array.isArray(input)) return { ok: false, error: 'files must be an array' }
  if (input.length < 1 || input.length > LIMITS.MAX_FILES) {
    return { ok: false, error: `files must contain between 1 and ${LIMITS.MAX_FILES} entries` }
  }
  const files: FileMeta[] = []
  const seenIds = new Set<string>()
  let total = 0
  for (const raw of input) {
    if (!isRecord(raw)) return { ok: false, error: 'each file must be an object' }
    const name = sanitizeFileName(raw.name)
    if (!name) return { ok: false, error: 'invalid file name' }
    const size = raw.size
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 1 || size > LIMITS.MAX_FILE_BYTES) {
      return { ok: false, error: 'file size must be between 1 byte and 2 GB' }
    }
    total += size
    if (total > LIMITS.MAX_TOTAL_BYTES) return { ok: false, error: 'total session size exceeds 4 GB' }
    const type =
      typeof raw.type === 'string' && raw.type.length > 0 && raw.type.length <= 128
        ? raw.type
        : 'application/octet-stream'
    let id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw.id) ? raw.id : ''
    if (!id || seenIds.has(id)) {
      do {
        id = randomCode(12)
      } while (seenIds.has(id))
    }
    seenIds.add(id)
    files.push({ id, name, size: Math.floor(size), type })
  }
  return { ok: true, files }
}

// ---------------------------------------------------------------------------
// Rate limiting — sliding window, in-memory
// ---------------------------------------------------------------------------

export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records an attempt and returns whether it is within the limit. */
  check(key: string): boolean {
    const now = Date.now()
    const cutoff = now - this.windowMs
    let arr = this.hits.get(key)
    if (!arr) {
      arr = []
      this.hits.set(key, arr)
    }
    while (arr.length > 0 && arr[0] <= cutoff) arr.shift()
    arr.push(now) // rejected attempts count too
    return arr.length <= this.limit
  }

  /** Drops stale keys so the map cannot grow unboundedly. */
  sweep(): void {
    const cutoff = Date.now() - this.windowMs
    for (const [key, arr] of this.hits) {
      while (arr.length > 0 && arr[0] <= cutoff) arr.shift()
      if (arr.length === 0) this.hits.delete(key)
    }
  }
}

// ---------------------------------------------------------------------------
// Chunk throttling — token bucket, per socket (~3000 chunks/sec)
// ---------------------------------------------------------------------------

export class ChunkThrottle {
  private readonly buckets = new Map<string, { tokens: number; last: number }>()

  constructor(private readonly ratePerSec: number) {}

  allow(key: string): boolean {
    const now = performance.now()
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = { tokens: this.ratePerSec, last: now }
      this.buckets.set(key, bucket)
    }
    bucket.tokens = Math.min(this.ratePerSec, bucket.tokens + ((now - bucket.last) / 1000) * this.ratePerSec)
    bucket.last = now
    if (bucket.tokens < 1) return false
    bucket.tokens -= 1
    return true
  }

  drop(key: string): void {
    this.buckets.delete(key)
  }
}

// ---------------------------------------------------------------------------
// Session registry
// ---------------------------------------------------------------------------

export class SessionRegistry {
  private readonly sessions = new Map<string, SessionRecord>()

  /** Creates a session; returns the record and the raw token (shown once). */
  async create(files: FileMeta[], ttlMinutes: number): Promise<{ session: SessionRecord; token: string }> {
    let code = randomCode(CODE_LENGTH)
    while (this.sessions.has(code)) code = randomCode(CODE_LENGTH)
    const token = randomCode(TOKEN_LENGTH)
    const tokenHash = await sha256Hex(token)
    const ttlMs = Math.max(1, Math.round(ttlMinutes)) * 60_000
    const now = Date.now()
    const session: SessionRecord = {
      code,
      tokenHash,
      createdAt: now,
      expiresAt: now + ttlMs,
      ttlMs,
      status: 'active',
      manifest: files,
      hostSocketId: null,
      guestSocketId: null,
      guestDevice: null,
    }
    this.sessions.set(code, session)
    return { session, token }
  }

  get(code: string): SessionRecord | undefined {
    return this.sessions.get(code)
  }

  delete(code: string): void {
    this.sessions.delete(code)
  }

  all(): IterableIterator<SessionRecord> {
    return this.sessions.values()
  }

  get size(): number {
    return this.sessions.size
  }

  /** Verifies a raw token against the stored SHA-256 hash (timing-safe). */
  async verifyToken(session: SessionRecord, token: string): Promise<boolean> {
    const hash = await sha256Hex(token)
    return safeEqual(hash, session.tokenHash)
  }

  /** Live view used for REST + beam:joined payloads. */
  view(session: SessionRecord, isLive: (socketId: string | null) => boolean): SessionPublicView {
    return {
      code: session.code,
      expiresAt: session.expiresAt,
      status: session.status,
      fileManifest: session.manifest,
      hostConnected: isLive(session.hostSocketId),
      guestConnected: isLive(session.guestSocketId),
      guestDevice: session.guestDevice,
    }
  }
}
