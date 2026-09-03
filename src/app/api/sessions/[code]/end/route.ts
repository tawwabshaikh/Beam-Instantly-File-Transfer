import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

/** End a session — proxies to the session service and updates bookkeeping. */

const SERVICE_URL = process.env.SESSION_SERVICE_URL ?? 'http://127.0.0.1:3003'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request body' }, { status: 400 })
  }
  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Missing session token' }, { status: 400 })
  }

  try {
    const upstream = await fetch(`${SERVICE_URL}/sessions/${encodeURIComponent(code)}/end?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      cache: 'no-store',
    })
    const data = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      return NextResponse.json(data ?? { ok: false, message: 'Could not end session' }, { status: upstream.status })
    }

    try {
      const { db } = await import('@/lib/db')
      await db.transferSession.updateMany({
        where: { code, tokenHash: createHash('sha256').update(token).digest('hex') },
        data: { status: 'ended', endedAt: new Date() },
      })
    } catch {
      // best-effort
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Session service unavailable' },
      { status: 502 },
    )
  }
}
