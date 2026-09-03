/**
 * Central configuration with production-ready environment overrides.
 *
 * In the Z.ai sandbox the socket/signaling service is reached through the
 * Caddy gateway using the XTransformPort query param. In a real production
 * deployment set NEXT_PUBLIC_SIGNALING_WS_URL (e.g. wss://beam.example.com/signaling)
 * and the STUN/TURN servers below — no code changes required.
 */

function envList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** socket.io endpoint for the signaling/session service. */
export const SIGNALING_WS_URL =
  process.env.NEXT_PUBLIC_SIGNALING_WS_URL ?? '/?XTransformPort=3003'

/** Base URL of the Beam REST API (session create/validate proxy on Next.js). */
export const REST_BASE_URL = process.env.NEXT_PUBLIC_REST_BASE_URL ?? ''

/** ICE configuration — STUN required, TURN optional (env-configured). */
export const STUN_URLS = envList(process.env.NEXT_PUBLIC_STUN_URLS, [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
])

export const TURN_URLS = envList(process.env.NEXT_PUBLIC_TURN_URLS, [])
export const TURN_USERNAME = process.env.NEXT_PUBLIC_TURN_USERNAME ?? ''
export const TURN_CREDENTIAL = process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? ''

export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = []
  if (STUN_URLS.length > 0) servers.push({ urls: STUN_URLS })
  if (TURN_URLS.length > 0) {
    servers.push({
      urls: TURN_URLS,
      username: TURN_USERNAME || undefined,
      credential: TURN_CREDENTIAL || undefined,
    })
  }
  return servers
}

/** Session lifetime in minutes (server enforces its own env too). */
export const SESSION_TTL_MINUTES = 10
