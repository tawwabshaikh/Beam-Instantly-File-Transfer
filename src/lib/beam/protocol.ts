/**
 * Beam protocol v1 — shared types between the Next.js client and the
 * session/signaling mini-service. Keep in sync with
 * mini-services/session-service/protocol.ts
 */

export type Role = 'host' | 'guest'

/** Desktop → Phone or Phone → Desktop */
export type TransferDirection = 'd2p' | 'p2d'

export type TransportMode = 'webrtc' | 'relay'

export interface DeviceInfo {
  platform: string
  browser: string
  isMobile: boolean
}

export interface FileMeta {
  id: string
  name: string
  size: number
  type: string
}

export interface SessionFileInfo {
  code: string
  expiresAt: number // epoch ms
  status: 'active' | 'expired' | 'ended'
  fileManifest: FileMeta[]
  hostConnected: boolean
  guestConnected: boolean
  guestDevice: DeviceInfo | null
}

export interface JoinSuccess {
  ok: true
  role: Role
  session: SessionFileInfo
  yourDevice?: DeviceInfo | null
}

export type BeamErrorCode =
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'ENDED'
  | 'INVALID_TOKEN'
  | 'ROLE_TAKEN'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'INTERNAL'

export interface BeamError {
  ok: false
  code: BeamErrorCode
  message: string
}

export interface SignalPayload {
  type: 'offer' | 'answer' | 'candidate'
  payload: unknown
}

/** ---- Client → Server ---- */
export interface JoinPayload {
  code: string
  token: string
  role: Role
  device: DeviceInfo
}

export interface CodePayload {
  code: string
}

export interface ModePayload extends CodePayload {
  mode: TransportMode
}

export interface ManifestPayload extends CodePayload {
  files: FileMeta[]
}

export interface TransferRequestPayload extends CodePayload {
  transferId: string
  fileId: string
  direction: TransferDirection
}

export interface TransferStartPayload extends CodePayload {
  transferId: string
  file: FileMeta
  direction: TransferDirection
}

export interface TransferChunkPayload extends CodePayload {
  transferId: string
  seq: number
  data: ArrayBuffer
}

export interface TransferAckPayload extends CodePayload {
  transferId: string
  seq: number
}

export interface TransferDonePayload extends CodePayload {
  transferId: string
}

export interface TransferCancelPayload extends CodePayload {
  transferId: string
  reason?: string
}

export interface TransferErrorPayload extends CodePayload {
  transferId: string
  message: string
}

export interface PeerEventPayload {
  event: 'joined' | 'left'
  device: DeviceInfo | null
}

export interface ModeEventPayload {
  mode: TransportMode
}

/** Client → Server: short text note for the paired device (relay-only, tiny). */
export interface NotePayload extends CodePayload {
  text: string
}

/** Server → peer: a text note from the other device. */
export interface NoteEventPayload {
  text: string
  from: Role
  at: number
}

/** Server → room: the host extended the session; new absolute expiry. */
export interface ExtendedEventPayload {
  expiresAt: number
}

/** ---- Limits (kept in sync with service env defaults) ---- */
export const LIMITS = {
  MAX_FILES: 20,
  MAX_FILE_BYTES: 2 * 1024 * 1024 * 1024, // 2 GB per file
  MAX_TOTAL_BYTES: 4 * 1024 * 1024 * 1024, // 4 GB per session
  CHUNK_SIZE_WEBRTC: 16 * 1024, // 16 KB — safe SCTP chunk across browsers
  CHUNK_SIZE_RELAY: 128 * 1024, // 128 KB per WS frame
  RELAY_WINDOW: 6, // unacked chunks in flight over relay
  BUFFER_HIGH_WATER: 4 * 1024 * 1024, // DC bufferedAmount cap
  BUFFER_LOW_WATER: 512 * 1024,
  P2P_TIMEOUT_MS: 12_000, // wait for DataChannel before relay fallback
  MAX_NOTE_CHARS: 20_000, // text notes relayed between peers
} as const

/** A session can be extended only within this window before expiry. */
export const EXTEND_WINDOW_MS = 5 * 60_000

/** Extensions we refuse to transfer (executables / scripts). */
export const BLOCKED_EXTENSIONS = [
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'cpl', 'ps1', 'vbs', 'jar',
]
