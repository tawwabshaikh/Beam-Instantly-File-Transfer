import type { BeamError } from './protocol'

/**
 * REST client for Beam session endpoints (proxied by Next.js API routes,
 * which also persist session metadata).
 */

/**
 * Base URL of the Beam REST API. Empty string = same-origin (browser default).
 * NEXT_PUBLIC_REST_BASE_URL lets server-side/CLI consumers (tests) point at a
 * concrete origin.
 */
const BASE = process.env.NEXT_PUBLIC_REST_BASE_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    })
  } catch {
    throw new ApiError('NETWORK', 'Cannot reach the Beam service. Check your connection and try again.')
  }
  const body = (await res.json().catch(() => null)) as (T & { message?: string }) | null
  if (!res.ok) {
    const code = (body as unknown as { code?: string })?.code ?? 'UNKNOWN'
    throw new ApiError(code, body?.message ?? `Request failed (${res.status})`)
  }
  if (!body) throw new ApiError('UNKNOWN', 'Malformed response from server')
  return body
}

export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export interface CreatedSession {
  code: string
  token: string
  expiresAt: number
}

export interface SessionInfoResponse {
  ok: true
  session: {
    code: string
    expiresAt: number
    status: 'active' | 'expired' | 'ended'
    fileManifest: { id: string; name: string; size: number; type: string }[]
    hostConnected: boolean
    guestConnected: boolean
    guestDevice: { platform: string; browser: string; isMobile: boolean } | null
  }
}

export async function createSession(
  files: { id: string; name: string; size: number; type: string }[],
): Promise<CreatedSession> {
  return request<CreatedSession>(`${BASE}/api/sessions`, {
    method: 'POST',
    body: JSON.stringify({ files }),
  })
}

export async function getSession(code: string, token: string): Promise<SessionInfoResponse> {
  return request<SessionInfoResponse>(
    `${BASE}/api/sessions/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`,
  )
}

export async function endSession(code: string, token: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`${BASE}/api/sessions/${encodeURIComponent(code)}/end`, {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

export function friendlyError(err: unknown): { title: string; message: string } {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'NOT_FOUND':
        return { title: 'Session not found', message: 'This session has expired or the code is incorrect. Create a new session to continue.' }
      case 'EXPIRED':
        return { title: 'Session expired', message: 'This pairing session has expired. Create a new session to continue.' }
      case 'ENDED':
        return { title: 'Session ended', message: 'This session was already ended.' }
      case 'INVALID_TOKEN':
        return { title: 'Invalid pairing link', message: 'The security token for this session is invalid. Please scan the QR code again.' }
      case 'RATE_LIMITED':
        return { title: 'Too many attempts', message: 'You are doing that too often. Please wait a moment and try again.' }
      case 'NETWORK':
        return { title: 'Connection problem', message: err.message }
      default:
        return { title: 'Something went wrong', message: err.message }
    }
  }
  return {
    title: 'Unexpected error',
    message: err instanceof Error ? err.message : 'Please try again.',
  }
}

export type { BeamError }
