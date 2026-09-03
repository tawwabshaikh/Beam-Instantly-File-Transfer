import { NextRequest, NextResponse } from 'next/server'

/** Validate a session (phone side) — proxies to the session service. */

const SERVICE_URL = process.env.SESSION_SERVICE_URL ?? 'http://127.0.0.1:3003'

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
  return true
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'local'
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!rateLimit(`get:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json(
      { ok: false, code: 'RATE_LIMITED', message: 'Too many attempts. Wait a moment and try again.' },
      { status: 429 },
    )
  }

  const { code } = await params
  const token = req.nextUrl.searchParams.get('token') ?? ''

  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code) || token.length < 8 || token.length > 128) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_TOKEN', message: 'This pairing link is malformed.' },
      { status: 400 },
    )
  }

  try {
    const upstream = await fetch(
      `${SERVICE_URL}/sessions/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    )
    const data = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      return NextResponse.json(data ?? { ok: false, code: 'NOT_FOUND', message: 'Session not found' }, {
        status: upstream.status,
      })
    }

    // Best-effort status touch
    try {
      const { db } = await import('@/lib/db')
      await db.transferSession.updateMany({
        where: { code, status: 'active' },
        data: { status: 'connected' },
      })
    } catch {
      // ignore
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { ok: false, code: 'INTERNAL', message: 'Session service unavailable. Try again in a moment.' },
      { status: 502 },
    )
  }
}
