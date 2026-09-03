import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

/**
 * Session API — thin, secured proxy in front of the session/signaling
 * mini-service. Persists session METADATA (never file data, never raw tokens)
 * via Prisma for bookkeeping.
 *
 * Production: point SESSION_SERVICE_URL at your deployed signaling service.
 */

const SERVICE_URL = process.env.SESSION_SERVICE_URL ?? 'http://127.0.0.1:3003'
const DEFAULT_TTL_MINUTES = 10
const MAX_TTL_MINUTES = 60
const MAX_FILES = 20
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024
const MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024

/* ---------------- tiny per-IP rate limiter ---------------- */

const buckets = new Map<string, number[]>()

function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (arr.length >= limit) {
    buckets.set(key, arr)
    return false
  }
  arr.push(now)
  buckets.set(key, arr)
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k)
    }
  }
  return true
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'local'
  )
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/* ---------------- routes ---------------- */

export async function POST(req: NextRequest) {
  if (!rateLimit(`create:${clientIp(req)}`, 12, 60_000)) {
    return NextResponse.json(
      { ok: false, code: 'RATE_LIMITED', message: 'Too many sessions created. Slow down for a minute.' },
      { status: 429 },
    )
  }

  let body: { files?: { id?: string; name?: string; size?: number; type?: string }[]; ttlMinutes?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid request body' }, { status: 400 })
  }

  const files = Array.isArray(body.files) ? body.files : []
  if (files.length === 0 || files.length > MAX_FILES) {
    return NextResponse.json(
      { ok: false, code: 'BAD_REQUEST', message: `Sessions must contain 1–${MAX_FILES} files` },
      { status: 400 },
    )
  }

  // The service accepts ids matching /^[A-Za-z0-9_-]{1,64}$/ and regenerates
  // anything else — preserving client ids is REQUIRED so the host can map
  // guest download requests back to its local File objects.
  const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/

  let total = 0
  for (const f of files) {
    if (typeof f.name !== 'string' || f.name.length === 0 || f.name.length > 255) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid file name' }, { status: 400 })
    }
    if (typeof f.size !== 'number' || f.size <= 0 || f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'File size out of allowed range' }, { status: 400 })
    }
    total += f.size
  }
  if (total > MAX_TOTAL_BYTES) {
    return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Total session size exceeds 4 GB' }, { status: 400 })
  }

  const ttl = Math.min(
    Math.max(typeof body.ttlMinutes === 'number' ? body.ttlMinutes : DEFAULT_TTL_MINUTES, 1),
    MAX_TTL_MINUTES,
  )

  // Forward to the session service — it generates code + token and owns the live session.
  let upstream: Response
  try {
    upstream = await fetch(`${SERVICE_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: files.map((f, i) => ({
          id: typeof f.id === 'string' && VALID_ID.test(f.id) ? f.id : `f${i}`.padEnd(8, '0'),
          name: f.name,
          size: f.size,
          type: typeof f.type === 'string' && f.type ? f.type : 'application/octet-stream',
        })),
        ttlMinutes: ttl,
      }),
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json(
      { ok: false, code: 'INTERNAL', message: 'Session service unavailable. Try again in a moment.' },
      { status: 502 },
    )
  }

  const data = await upstream.json().catch(() => null)
  if (!upstream.ok || !data?.code || !data?.token) {
    return NextResponse.json(
      { ok: false, code: data?.code ?? 'INTERNAL', message: data?.message ?? 'Could not create session' },
      { status: upstream.status },
    )
  }

  // Persist metadata only (hashed token — raw token never touches the DB).
  try {
    const { db } = await import('@/lib/db')
    await db.transferSession.create({
      data: {
        code: data.code,
        tokenHash: sha256(data.token),
        status: 'active',
        fileCount: files.length,
        totalBytes: total,
        expiresAt: new Date(data.expiresAt),
      },
    })
  } catch (e) {
    // Bookkeeping is best-effort — never block the user flow on DB hiccups.
    console.error('session bookkeeping failed', e)
  }

  return NextResponse.json({ code: data.code, token: data.token, expiresAt: data.expiresAt })
}
