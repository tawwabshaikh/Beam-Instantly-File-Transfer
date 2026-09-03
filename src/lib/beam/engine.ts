'use client'

import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'
import {
  LIMITS,
  type DeviceInfo,
  type FileMeta,
  type Role,
  type TransferDirection,
  type TransportMode,
} from './protocol'
import { SESSION_TTL_MINUTES, SIGNALING_WS_URL } from './config'
import {
  CHANNEL_D2P,
  CHANNEL_P2D,
  createPeerConnection,
  waitForDrain,
  waitUntilOpen,
} from './webrtc'
import { genId, isBlockedType, makePreviewUrl, validateFiles } from './files'
import { getDeviceInfo, describeDevice } from './device'
import { recordHistory } from './history'
import { playChime } from './chime'
import * as api from './api'

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type BeamPhase =
  | 'idle' // desktop: no session yet
  | 'creating' // desktop: creating session
  | 'waiting' // desktop: QR shown, waiting for phone
  | 'opening' // phone: validating QR link
  | 'connecting' // both: negotiating transport
  | 'connected' // both: transport ready, transfers allowed
  | 'expired' // session expired
  | 'ended' // session ended
  | 'failed' // unrecoverable error (retry available)
  | 'invalid' // phone: bad/unknown QR
  | 'lost' // peer connection lost (phone retries; desktop returns to waiting)

export interface SelectedFile {
  id: string
  name: string
  size: number
  type: string
  file: File
  previewUrl: string | null
}

export interface TransferRow {
  id: string
  fileId: string
  name: string
  size: number
  type: string
  direction: TransferDirection
  status: 'queued' | 'active' | 'done' | 'error' | 'canceled'
  transferred: number
  speed: number
  etaSec: number | null
  startedAt: number | null
  error: string | null
  transport: 'webrtc' | 'relay' | null
}

export interface ReceivedFile {
  id: string
  name: string
  size: number
  type: string
  url: string
  direction: TransferDirection
  receivedAt: number
}

export interface BeamSession {
  code: string
  token: string
  expiresAt: number
  joinUrl: string
}

/** A short text note exchanged with the paired device. */
export interface BeamNote {
  id: string
  text: string
  from: Role
  at: number
}

export interface BeamState {
  role: Role | null
  phase: BeamPhase
  error: { title: string; message: string } | null
  session: BeamSession | null
  /** Requested session length in minutes (picked on the desktop before pairing). */
  ttlMinutes: number
  selectedFiles: SelectedFile[]
  manifest: FileMeta[]
  mobileFiles: SelectedFile[]
  incomingFiles: FileMeta[]
  transfers: Record<string, TransferRow>
  received: ReceivedFile[]
  notes: BeamNote[]
  mode: TransportMode | 'none'
  peerDevice: DeviceInfo | null
  connectedAt: number | null
  stats: { filesTransferred: number; totalData: number }
}

interface BeamActions {
  addFiles(files: FileList | File[]): void
  removeSelectedFile(id: string): void
  reorderSelectedFiles(fromId: string, toId: string): void
  setTtlMinutes(minutes: number): void
  createNewSession(): Promise<void>
  endSession(): Promise<void>
  resetAll(): void
  openSession(code: string, token: string): Promise<void>
  reconnect(): void
  requestDownload(fileId: string): void
  downloadAll(): void
  addMobileFiles(files: FileList | File[]): void
  removeMobileFile(id: string): void
  saveReceived(id: string): void
  shareReceived(id: string): Promise<void>
  dismissReceived(id: string): void
  sendNote(text: string): void
  extendSession(): void
  retryTransfer(transferId: string): void
  cancelTransfer(transferId: string): void
  markExpiredIfDue(): void
}

export type BeamStore = BeamState & BeamActions

/* ------------------------------------------------------------------ */
/* Module-level runtime (socket, peer, queues)                        */
/* ------------------------------------------------------------------ */

let socket: Socket | null = null
let pc: RTCPeerConnection | null = null
let dcD2P: RTCDataChannel | null = null // host sends / guest receives
let dcP2D: RTCDataChannel | null = null // guest sends / host receives
let inboundDcTransfer: string | null = null
let p2pTimer: ReturnType<typeof setTimeout> | null = null
let guestTimer: ReturnType<typeof setTimeout> | null = null
let joiningCode: string | null = null // guards openSession re-entry
let joinSentFor: string | null = null // guards duplicate beam:join emits
let joinAttempts = 0

const fileObjects = new Map<string, File>() // this device's outbound files
const MAX_NOTES = 50 // notes kept in memory per session
const sinks = new Map<
  string,
  { parts: ArrayBuffer[]; received: number; meta: FileMeta; direction: TransferDirection }
>()
const ackWaiters = new Map<string, Array<{ resolve: () => void; timer: ReturnType<typeof setTimeout> }>>()
const relayInflight = new Map<string, number>() // transferId → true unacked-chunk count
const samples = new Map<string, { t: number; b: number }[]>()
const lastSpeed = new Map<string, number>()
const flushTimes = new Map<string, number>()
const canceledIds = new Set<string>()

/** QA instrumentation (read via window.__beam.debug). */
const beamDebug = {
  chunksHandled: 0,
  noteProgressCalls: 0,
  flushes: 0,
  storeWrites: 0,
}

let sendQueue: { transferId: string; fileId: string }[] = []
let sendActive = false

/* ------------------------------------------------------------------ */
/* Small utilities                                                    */
/* ------------------------------------------------------------------ */

/** Decoupled notifications: engine → <BeamToaster /> via DOM events. */
export function notify(type: 'success' | 'error' | 'info', title: string, description?: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('beam:notify', { detail: { type, title, description } }))
}

function emitCode<T extends object>(event: string, payload: T): void {
  if (!socket || !socket.connected) return
  const session = useBeamStore.getState().session
  if (!session) return
  socket.emit(event, { code: session.code, ...payload })
}

function patchTransfer(id: string, patch: Partial<TransferRow>): void {
  useBeamStore.setState((state) => {
    const row = state.transfers[id]
    if (!row) return state
    beamDebug.storeWrites++
    return { transfers: { ...state.transfers, [id]: { ...row, ...patch } } }
  })
}

function upsertRow(id: string, row: TransferRow): void {
  useBeamStore.setState((state) => ({
    transfers: { ...state.transfers, [id]: { ...state.transfers[id], ...row } },
  }))
}

/** Host re-publishes the download manifest (order included) to the peer. */
function publishManifestIfHost(): void {
  const st = useBeamStore.getState()
  if (st.session && st.role === 'host' && ['waiting', 'connecting', 'connected'].includes(st.phase)) {
    emitCode('beam:manifest', {
      files: st.selectedFiles.map((f) => ({ id: f.id, name: f.name, size: f.size, type: f.type })),
    })
  }
}

function noteProgress(id: string, transferred: number, size: number): void {
  beamDebug.noteProgressCalls++
  const now = Date.now()
  const arr = samples.get(id) ?? []
  arr.push({ t: now, b: transferred })
  while (arr.length > 2 && now - arr[0].t > 4000) arr.shift()
  samples.set(id, arr)

  let speed = lastSpeed.get(id) ?? 0
  const first = arr[0]
  const last = arr[arr.length - 1]
  if (arr.length >= 2 && last.t - first.t > 300) {
    const inst = (last.b - first.b) / ((last.t - first.t) / 1000)
    speed = speed === 0 ? inst : speed * 0.6 + inst * 0.4
    lastSpeed.set(id, speed)
  }

  const lastFlush = flushTimes.get(id) ?? 0
  if (now - lastFlush >= 120) {
    flushTimes.set(id, now)
    beamDebug.flushes++
    patchTransfer(id, {
      transferred,
      speed,
      etaSec: speed > 0 && transferred < size ? (size - transferred) / speed : null,
    })
  }
}

function triggerDownload(url: string, name: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/* ------------------------------------------------------------------ */
/* Receiving                                                          */
/* ------------------------------------------------------------------ */

function handleStart(transferId: string, file: FileMeta, direction: TransferDirection): void {
  canceledIds.delete(transferId)
  sinks.set(transferId, { parts: [], received: 0, meta: file, direction })
  samples.delete(transferId)
  lastSpeed.delete(transferId)
  upsertRow(transferId, {
    id: transferId,
    fileId: file.id,
    name: file.name,
    size: file.size,
    type: file.type,
    direction,
    status: 'active',
    transferred: 0,
    speed: 0,
    etaSec: null,
    startedAt: Date.now(),
    error: null,
    transport: useBeamStore.getState().mode === 'webrtc' ? 'webrtc' : 'relay',
  })
}

function handleChunk(transferId: string, data: ArrayBuffer): void {
  beamDebug.chunksHandled++
  const sink = sinks.get(transferId)
  if (!sink || canceledIds.has(transferId)) return
  sink.parts.push(data)
  sink.received += data.byteLength
  noteProgress(transferId, sink.received, sink.meta.size)
  // Ack every chunk — cheap, and the relay sender uses it for flow control.
  emitCode('beam:transfer:ack', { transferId, seq: 0 })
}

function handleDone(transferId: string): void {
  const sink = sinks.get(transferId)
  if (!sink) return
  sinks.delete(transferId)
  inboundDcTransfer = null
  const blob = new Blob(sink.parts, { type: sink.meta.type || 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const state = useBeamStore.getState()

  const received: ReceivedFile = {
    id: transferId,
    name: sink.meta.name,
    size: sink.meta.size,
    type: sink.meta.type,
    url,
    direction: sink.direction,
    receivedAt: Date.now(),
  }

  if (state.role === 'guest') triggerDownload(url, sink.meta.name)

  useBeamStore.setState((s) => ({
    transfers: {
      ...s.transfers,
      [transferId]: {
        ...s.transfers[transferId],
        status: 'done',
        transferred: sink.meta.size,
        speed: 0,
        etaSec: 0,
      },
    },
    received: [received, ...s.received.filter((r) => r.id !== transferId)],
    stats: {
      filesTransferred: s.stats.filesTransferred + 1,
      totalData: s.stats.totalData + sink.meta.size,
    },
  }))

  recordHistory({
    name: sink.meta.name,
    size: sink.meta.size,
    direction: sink.direction,
    status: 'completed',
    sessionCode: state.session?.code ?? '',
  })

  notify(
    'success',
    state.role === 'guest' ? 'Download completed' : 'File received',
    sink.meta.name,
  )
  playChime()
  pumpSend()
}

function handleTransferError(transferId: string, message: string): void {
  sinks.delete(transferId)
  ackWaiters.delete(transferId)
  relayInflight.delete(transferId)
  canceledIds.delete(transferId)
  patchTransfer(transferId, { status: 'error', error: message, speed: 0 })
  notify('error', 'Transfer failed', message)
  recordHistory({
    name: useBeamStore.getState().transfers[transferId]?.name ?? 'Unknown file',
    size: useBeamStore.getState().transfers[transferId]?.size ?? 0,
    direction: useBeamStore.getState().transfers[transferId]?.direction ?? 'd2p',
    status: 'failed',
    sessionCode: useBeamStore.getState().session?.code ?? '',
  })
  pumpSend()
}

function handleCancel(transferId: string): void {
  canceledIds.add(transferId)
  sinks.delete(transferId)
  ackWaiters.delete(transferId)
  relayInflight.delete(transferId)
  patchTransfer(transferId, { status: 'canceled', speed: 0 })
  pumpSend()
}

/* ------------------------------------------------------------------ */
/* Sending                                                            */
/* ------------------------------------------------------------------ */

function enqueueSend(transferId: string, fileId: string): void {
  sendQueue.push({ transferId, fileId })
  pumpSend()
}

function pumpSend(): void {
  if (sendActive || sendQueue.length === 0) return
  const next = sendQueue.shift()
  if (!next) return
  sendActive = true
  const { transferId, fileId } = next
  const file = fileObjects.get(fileId)
  if (!file) {
    emitCode('beam:transfer:error', { transferId, message: 'File is no longer available on this device' })
    patchTransfer(transferId, { status: 'error', error: 'File no longer available' })
    sendActive = false
    pumpSend()
    return
  }
  const meta: FileMeta = { id: fileId, name: file.name, size: file.size, type: file.type }
  processSend(transferId, file, meta)
    .catch((err) => {
      const message = err instanceof Error ? err.message : 'Transfer failed'
      emitCode('beam:transfer:error', { transferId, message })
      patchTransfer(transferId, { status: 'error', error: message, speed: 0 })
      notify('error', 'Transfer failed', `${file.name} — ${message}`)
    })
    .finally(() => {
      sendActive = false
      pumpSend()
    })
}

async function processSend(transferId: string, file: File, meta: FileMeta): Promise<void> {
  if (canceledIds.has(transferId)) {
    patchTransfer(transferId, { status: 'canceled' })
    return
  }
  patchTransfer(transferId, { status: 'active', startedAt: Date.now(), error: null })

  const useDC = useBeamStore.getState().mode === 'webrtc' && getOutboundChannel()?.readyState === 'open'
  if (useDC) {
    patchTransfer(transferId, { transport: 'webrtc' })
    try {
      await sendOverDC(transferId, file, meta)
      finishSend(transferId, file, meta)
      return
    } catch (err) {
      if (canceledIds.has(transferId)) return patchTransfer(transferId, { status: 'canceled' })
      // Data channel broke mid-transfer — one clean retry over the relay.
      notify('info', 'Direct connection lost', 'Falling back to secure relay for this file…')
    }
  }

  patchTransfer(transferId, { transport: 'relay' })
  await sendOverRelay(transferId, file, meta)
  finishSend(transferId, file, meta)
}

function finishSend(transferId: string, file: File, meta: FileMeta): void {
  if (canceledIds.has(transferId)) {
    patchTransfer(transferId, { status: 'canceled' })
    return
  }
  const state = useBeamStore.getState()
  useBeamStore.setState((s) => ({
    transfers: {
      ...s.transfers,
      [transferId]: {
        ...s.transfers[transferId],
        status: 'done',
        transferred: meta.size,
        speed: 0,
        etaSec: 0,
      },
    },
    stats: {
      filesTransferred: s.stats.filesTransferred + 1,
      totalData: s.stats.totalData + meta.size,
    },
  }))
  recordHistory({
    name: meta.name,
    size: meta.size,
    direction: state.role === 'host' ? 'd2p' : 'p2d',
    status: 'completed',
    sessionCode: state.session?.code ?? '',
  })
  playChime()
  notify('success', 'Transfer completed', file.name)
}

/**
 * WebRTC SCTP chunk size. 64 KB when BOTH ends are Chromium-based (their SCTP
 * stack handles it fine and throughput roughly doubles); anything else falls
 * back to the conservative 16 KB cross-browser default. Receiver appends
 * chunks in arrival order (seq is informational), so no negotiation handshake
 * is needed — the sender's choice is self-contained.
 */
const CHROMIUM_BROWSERS = new Set(['Chrome', 'Edge', 'Opera', 'Samsung Internet', 'Chromium'])
function getWebrtcChunkSize(): number {
  const peerBrowser = useBeamStore.getState().peerDevice?.browser
  if (!peerBrowser) return LIMITS.CHUNK_SIZE_WEBRTC
  const mine = getDeviceInfo().browser
  return CHROMIUM_BROWSERS.has(peerBrowser) && CHROMIUM_BROWSERS.has(mine)
    ? 64 * 1024
    : LIMITS.CHUNK_SIZE_WEBRTC
}

async function sendOverDC(transferId: string, file: File, meta: FileMeta): Promise<void> {
  const dc = getOutboundChannel()
  if (!dc || dc.readyState !== 'open') throw new Error('Direct channel not open')
  dc.send(JSON.stringify({ kind: 'start', transferId, file: meta }))

  const CHUNK = getWebrtcChunkSize()
  let offset = 0
  while (offset < file.size) {
    if (dc.readyState !== 'open') throw new Error('Connection lost during transfer')
    if (canceledIds.has(transferId)) throw new CancelledError()
    if (dc.bufferedAmount > LIMITS.BUFFER_HIGH_WATER) await waitForDrain(dc)
    const buf = await file.slice(offset, offset + CHUNK).arrayBuffer()
    dc.send(buf)
    offset += buf.byteLength
    noteProgress(transferId, offset, file.size)
  }
  dc.send(JSON.stringify({ kind: 'done', transferId }))
}

class CancelledError extends Error {
  constructor() {
    super('Cancelled')
  }
}

async function sendOverRelay(transferId: string, file: File, meta: FileMeta): Promise<void> {
  emitCode('beam:transfer:start', { transferId, file: meta, direction: useBeamStore.getState().role === 'host' ? 'd2p' : 'p2d' })

  const CHUNK = LIMITS.CHUNK_SIZE_RELAY
  let offset = 0
  relayInflight.set(transferId, 0)

  while (offset < file.size) {
    if (canceledIds.has(transferId)) throw new CancelledError()
    if (!socket || !socket.connected) throw new Error('Connection lost during transfer')
    if ((relayInflight.get(transferId) ?? 0) >= LIMITS.RELAY_WINDOW) {
      await waitRelayBelow(transferId, LIMITS.RELAY_WINDOW)
    }
    const buf = await file.slice(offset, offset + CHUNK).arrayBuffer()
    emitCode('beam:transfer:chunk', { transferId, seq: offset / CHUNK, data: buf })
    offset += buf.byteLength
    relayInflight.set(transferId, (relayInflight.get(transferId) ?? 0) + 1)
    noteProgress(transferId, offset, file.size)
  }

  // Drain: wait until every sent chunk has been acknowledged. The unacked
  // count is decremented by the ack handler even when no waiter is pending,
  // so acks that arrived early are never "lost".
  while ((relayInflight.get(transferId) ?? 0) > 0) {
    await waitRelayBelow(transferId, 1)
  }
  relayInflight.delete(transferId)
  emitCode('beam:transfer:done', { transferId })
}

/**
 * Resolve when the unacked count drops below `threshold`. Each incoming ack
 * wakes exactly one waiter; callers re-check their predicate after waking.
 */
function waitRelayBelow(transferId: string, threshold: number): Promise<void> {
  // Predicate already satisfied (e.g. acks arrived before we started waiting)?
  if ((relayInflight.get(transferId) ?? 0) < threshold) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const entry = {
      resolve,
      timer: setTimeout(() => {
        const q = ackWaiters.get(transferId)
        if (q) ackWaiters.set(transferId, q.filter((e) => e !== entry))
        reject(new Error('Transfer stalled — no acknowledgement from receiver'))
      }, 30_000),
    }
    const q = ackWaiters.get(transferId) ?? []
    q.push(entry)
    ackWaiters.set(transferId, q)
  })
}

function resolveAcks(transferId: string): void {
  // Every ack decrements the true unacked count — even without a pending
  // waiter — so early acks are never lost.
  const cur = relayInflight.get(transferId)
  if (cur !== undefined && cur > 0) relayInflight.set(transferId, cur - 1)

  const q = ackWaiters.get(transferId)
  const entry = q?.shift()
  if (entry) {
    clearTimeout(entry.timer)
    entry.resolve()
    if (q && q.length === 0) ackWaiters.delete(transferId)
  }
}

function getOutboundChannel(): RTCDataChannel | null {
  return useBeamStore.getState().role === 'host' ? dcD2P : dcP2D
}

/* ------------------------------------------------------------------ */
/* WebRTC wiring                                                      */
/* ------------------------------------------------------------------ */

function wireChannel(dc: RTCDataChannel, label: string): void {
  dc.binaryType = 'arraybuffer'
  dc.onmessage = (e) => {
    try {
      if (typeof e.data === 'string') {
        const msg = JSON.parse(e.data) as {
          kind: 'start' | 'done' | 'cancel'
          transferId: string
          file?: FileMeta
        }
        if (msg.kind === 'start' && msg.file) {
          inboundDcTransfer = msg.transferId
          const direction: TransferDirection = label === CHANNEL_D2P ? 'd2p' : 'p2d'
          handleStart(msg.transferId, msg.file, direction)
        } else if (msg.kind === 'done') {
          handleDone(msg.transferId)
        } else if (msg.kind === 'cancel') {
          handleCancel(msg.transferId)
        }
      } else if (e.data instanceof ArrayBuffer) {
        if (inboundDcTransfer) handleChunk(inboundDcTransfer, e.data)
      } else if (e.data instanceof Blob) {
        // Safari may deliver Blob unless binaryType was set before messages arrived
        e.data.arrayBuffer().then((buf) => {
          if (inboundDcTransfer) handleChunk(inboundDcTransfer, buf)
        })
      }
    } catch {
      // ignore malformed control frames
    }
  }
  dc.onclose = () => {
    if (label === CHANNEL_D2P) dcD2P = null
    else dcP2D = null
  }
}

function destroyPeer(): void {
  if (p2pTimer) {
    clearTimeout(p2pTimer)
    p2pTimer = null
  }
  try {
    pc?.close()
  } catch {
    // noop
  }
  pc = null
  dcD2P = null
  dcP2D = null
  inboundDcTransfer = null
}

function switchMode(mode: TransportMode): void {
  const st = useBeamStore.getState()
  if (st.mode !== 'none' || st.phase === 'expired' || st.phase === 'ended') return
  useBeamStore.setState({ mode, phase: 'connected', connectedAt: Date.now() })
  emitCode('beam:mode', { mode })
  if (p2pTimer) {
    clearTimeout(p2pTimer)
    p2pTimer = null
  }
  if (guestTimer) {
    clearTimeout(guestTimer)
    guestTimer = null
  }
}

async function hostStartPeerConnection(): Promise<void> {
  destroyPeer()
  const state = useBeamStore.getState()
  if (!state.session) return
  useBeamStore.setState({ phase: 'connecting', mode: 'none' })

  const peer = createPeerConnection()
  pc = peer

  const out = peer.createDataChannel(CHANNEL_D2P, { ordered: true })
  dcD2P = out
  wireChannel(out, CHANNEL_D2P)
  out.onopen = () => {
    // Both channels negotiated in the same SDP — outbound open ⇒ ready.
    switchMode('webrtc')
  }

  peer.ondatachannel = (e) => {
    if (e.channel.label === CHANNEL_P2D) {
      dcP2D = e.channel
      wireChannel(e.channel, CHANNEL_P2D)
    }
  }
  peer.onicecandidate = (e) => {
    if (e.candidate) emitCode('beam:signal', { signal: { type: 'candidate', payload: e.candidate.toJSON() } })
  }
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'failed' && useBeamStore.getState().mode === 'none') {
      switchMode('relay')
    }
  }

  const offer = await peer.createOffer()
  await peer.setLocalDescription(offer)
  emitCode('beam:signal', { signal: { type: 'offer', payload: peer.localDescription } })

  p2pTimer = setTimeout(() => {
    if (useBeamStore.getState().mode === 'none') switchMode('relay')
  }, LIMITS.P2P_TIMEOUT_MS)
}

async function guestAcceptOffer(offer: RTCSessionDescriptionInit): Promise<void> {
  destroyPeer()
  const peer = createPeerConnection()
  pc = peer
  useBeamStore.setState({ phase: 'connecting' })

  peer.ondatachannel = (e) => {
    if (e.channel.label === CHANNEL_D2P) {
      dcD2P = e.channel
      wireChannel(e.channel, CHANNEL_D2P)
    } else if (e.channel.label === CHANNEL_P2D) {
      dcP2D = e.channel
      wireChannel(e.channel, CHANNEL_P2D)
    }
  }
  peer.onicecandidate = (e) => {
    if (e.candidate) emitCode('beam:signal', { signal: { type: 'candidate', payload: e.candidate.toJSON() } })
  }

  await peer.setRemoteDescription(offer)
  const answer = await peer.createAnswer()
  await peer.setLocalDescription(answer)
  emitCode('beam:signal', { signal: { type: 'answer', payload: peer.localDescription } })
}

/* ------------------------------------------------------------------ */
/* Socket lifecycle                                                   */
/* ------------------------------------------------------------------ */

function ensureSocket(): Socket {
  if (socket) return socket
  socket = io(SIGNALING_WS_URL, {
    path: '/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 10000,
  })

  socket.on('connect', () => {
    joinAttempts = 0
    emitJoin()
  })
  socket.on('beam:joined', (data: { ok: true; role: Role; session: { code: string; expiresAt: number; status: string; fileManifest: FileMeta[]; hostConnected: boolean; guestConnected: boolean; guestDevice: DeviceInfo | null } }) => {
    const st = useBeamStore.getState()
    if (!data?.ok || !st.session || data.role !== st.role) return
    joiningCode = null
    joinSentFor = null
    useBeamStore.setState({ manifest: data.session.fileManifest ?? [] })

    if (st.role === 'host') {
      if (st.phase !== 'connected') useBeamStore.setState({ phase: 'waiting' })
    } else {
      if (st.phase === 'opening' || st.phase === 'lost') {
        useBeamStore.setState({ phase: 'connecting' })
        if (guestTimer) clearTimeout(guestTimer)
        guestTimer = setTimeout(() => {
          if (useBeamStore.getState().phase === 'connecting') {
            useBeamStore.setState({
              phase: 'lost',
              error: { title: 'Connection timed out', message: 'Could not reach the desktop. Make sure the Beam tab is still open on your computer, then try again.' },
            })
          }
        }, 30_000)
      }
    }
  })

  socket.on('beam:error', (err: { ok: false; code: string; message: string }) => {
    joiningCode = null
    joinSentFor = null
    const st = useBeamStore.getState()
    const message = err?.message ?? 'Unknown error'
    if (err?.code === 'EXPIRED') {
      useBeamStore.setState({ phase: 'expired', error: { title: 'Session expired', message } })
    } else if (err?.code === 'NOT_FOUND' || err?.code === 'INVALID_TOKEN' || err?.code === 'ENDED') {
      if (st.role === 'guest') {
        useBeamStore.setState({ phase: 'invalid', error: { title: 'Invalid or expired link', message } })
      } else {
        useBeamStore.setState({ phase: 'failed', error: { title: 'Session error', message } })
      }
    } else if (err?.code === 'ROLE_TAKEN') {
      useBeamStore.setState({ phase: 'failed', error: { title: 'Device already paired', message: 'Another device is already connected to this session.' } })
    } else if (err?.code === 'RATE_LIMITED') {
      useBeamStore.setState({ phase: 'failed', error: { title: 'Too many attempts', message } })
    } else {
      useBeamStore.setState({ phase: 'failed', error: { title: 'Connection error', message } })
    }
  })

  socket.on('beam:peer', (data: { event: 'joined' | 'left'; device: DeviceInfo | null }) => {
    const st = useBeamStore.getState()
    if (!st.session) return
    if (data.event === 'joined') {
      useBeamStore.setState({ peerDevice: data.device })
      if (st.role === 'host') {
        if (data.device) notify('success', 'Phone connected', `${describeDevice(data.device)} is ready to exchange files`)
        hostStartPeerConnection().catch(() => switchMode('relay'))
      } else if (st.phase === 'lost' || st.phase === 'failed') {
        useBeamStore.setState({ phase: 'connecting', error: null })
        if (guestTimer) clearTimeout(guestTimer)
        guestTimer = setTimeout(() => {
          if (useBeamStore.getState().phase === 'connecting') {
            useBeamStore.setState({ phase: 'lost', error: { title: 'Connection timed out', message: 'Could not reach the desktop. Try reconnecting.' } })
          }
        }, 30_000)
      }
    } else {
      useBeamStore.setState({ peerDevice: null, mode: 'none', connectedAt: null })
      destroyPeer()
      if (st.role === 'host') {
        useBeamStore.setState({ phase: 'waiting' })
        // Fail in-flight transfers so they can be retried after re-pairing
        Object.values(useBeamStore.getState().transfers).forEach((row) => {
          if (row.status === 'active' || row.status === 'queued') {
            patchTransfer(row.id, { status: 'error', error: 'Connection lost', speed: 0 })
          }
        })
        sinks.clear()
        ackWaiters.clear()
        sendQueue = []
        sendActive = false
        notify('info', 'Phone disconnected', 'Waiting for a device to rejoin — the QR code is still valid.')
      } else {
        useBeamStore.setState({ phase: 'lost', error: { title: 'Connection lost', message: 'The desktop connection was interrupted. Reconnect to continue.' } })
      }
    }
  })

  socket.on('beam:mode', (data: { mode: TransportMode }) => {
    if (useBeamStore.getState().role !== 'guest') return
    if (data?.mode === 'webrtc' || data?.mode === 'relay') switchMode(data.mode)
  })

  socket.on('beam:manifest', (data: { files: FileMeta[] }) => {
    if (useBeamStore.getState().role !== 'guest') return
    if (!Array.isArray(data?.files)) return
    const prev = useBeamStore.getState().manifest
    const prevIds = new Set(prev.map((f) => f.id))
    const added = data.files.filter((f) => f && f.id && !prevIds.has(f.id))
    useBeamStore.setState({ manifest: data.files })
    if (added.length > 0 && useBeamStore.getState().phase === 'connected') {
      notify(
        'info',
        added.length === 1 ? 'New file on desktop' : `${added.length} new files on desktop`,
        added.length <= 3
          ? added.map((f) => f.name).join(', ')
          : `${added.slice(0, 3).map((f) => f.name).join(', ')} +${added.length - 3} more`,
      )
      window.dispatchEvent(
        new CustomEvent('beam:manifest-update', { detail: { addedIds: added.map((f) => f.id) } }),
      )
    }
  })

  socket.on('beam:incoming', (data: { files: FileMeta[] }) => {
    const st = useBeamStore.getState()
    if (st.role !== 'host' || !Array.isArray(data?.files)) return
    const existing = new Set(st.incomingFiles.map((f) => f.id))
    const fresh = data.files.filter((f) => f && f.id && !existing.has(f.id) && f.size <= LIMITS.MAX_FILE_BYTES)
    if (fresh.length === 0) return
    useBeamStore.setState({ incomingFiles: [...st.incomingFiles, ...fresh] })
    for (const file of fresh) {
      const transferId = genId()
      upsertRow(transferId, {
        id: transferId,
        fileId: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        direction: 'p2d',
        status: 'queued',
        transferred: 0,
        speed: 0,
        etaSec: null,
        startedAt: null,
        error: null,
        transport: null,
      })
      emitCode('beam:transfer:request', { transferId, fileId: file.id, direction: 'p2d' })
    }
  })

  socket.on('beam:transfer:request', (data: { transferId: string; fileId: string; direction: TransferDirection }) => {
    const st = useBeamStore.getState()
    if (!st.session || !data?.transferId || !data?.fileId) return
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(data.transferId) || !/^[A-Za-z0-9_-]{1,64}$/.test(data.fileId)) return

    // Host: phone asks for a file we publish.
    if (st.role === 'host' && data.direction === 'd2p') {
      const metaFile = st.selectedFiles.find((f) => f.id === data.fileId)
      if (!metaFile) return
      upsertRow(data.transferId, {
        id: data.transferId,
        fileId: data.fileId,
        name: metaFile.name,
        size: metaFile.size,
        type: metaFile.type,
        direction: 'd2p',
        status: 'queued',
        transferred: 0,
        speed: 0,
        etaSec: null,
        startedAt: null,
        error: null,
        transport: null,
      })
      enqueueSend(data.transferId, data.fileId)
      return
    }

    // Host: phone re-requests to push one of its files (phone-side retry).
    // The sender owns the bytes — real metadata arrives with beam:transfer:start.
    if (st.role === 'host' && data.direction === 'p2d') {
      const known = st.incomingFiles.find((f) => f.id === data.fileId)
      upsertRow(data.transferId, {
        id: data.transferId,
        fileId: data.fileId,
        name: known?.name ?? 'File',
        size: known?.size ?? 0,
        type: known?.type ?? '',
        direction: 'p2d',
        status: 'queued',
        transferred: 0,
        speed: 0,
        etaSec: null,
        startedAt: null,
        error: null,
        transport: null,
      })
      return
    }

    // Guest: desktop asks us to (re)send one of our files.
    if (st.role === 'guest' && data.direction === 'p2d') {
      const metaFile = st.mobileFiles.find((f) => f.id === data.fileId)
      if (!metaFile) return
      upsertRow(data.transferId, {
        id: data.transferId,
        fileId: data.fileId,
        name: metaFile.name,
        size: metaFile.size,
        type: metaFile.type,
        direction: 'p2d',
        status: 'queued',
        transferred: 0,
        speed: 0,
        etaSec: null,
        startedAt: null,
        error: null,
        transport: null,
      })
      enqueueSend(data.transferId, data.fileId)
    }
  })

  socket.on('beam:transfer:start', (data: { transferId: string; file: FileMeta; direction: TransferDirection }) => {
    if (!data?.transferId || !data?.file) return
    handleStart(data.transferId, data.file, data.direction)
  })

  socket.on('beam:transfer:chunk', (data: { transferId: string; data: ArrayBuffer }) => {
    if (!data?.transferId || !data?.data) return
    handleChunk(data.transferId, data.data)
  })

  socket.on('beam:transfer:ack', (data: { transferId: string }) => {
    if (!data?.transferId) return
    resolveAcks(data.transferId)
  })

  socket.on('beam:transfer:done', (data: { transferId: string }) => {
    if (!data?.transferId) return
    handleDone(data.transferId)
  })

  socket.on('beam:transfer:cancel', (data: { transferId: string }) => {
    if (!data?.transferId) return
    handleCancel(data.transferId)
  })

  socket.on('beam:transfer:error', (data: { transferId: string; message: string }) => {
    if (!data?.transferId) return
    handleTransferError(data.transferId, data.message ?? 'Transfer failed')
  })

  socket.on('beam:ended', () => {
    destroyPeer()
    useBeamStore.setState({ phase: 'ended', mode: 'none', peerDevice: null })
    notify('info', 'Session ended', 'This transfer session has been closed.')
  })

  socket.on('beam:note', (data: { text: string; from: Role; at: number }) => {
    const st = useBeamStore.getState()
    if (!st.session || typeof data?.text !== 'string' || !data.text) return
    const note: BeamNote = {
      id: genId(),
      text: data.text.slice(0, LIMITS.MAX_NOTE_CHARS),
      from: data.from === 'host' ? 'host' : 'guest',
      at: typeof data.at === 'number' && Number.isFinite(data.at) ? data.at : Date.now(),
    }
    useBeamStore.setState((s) => ({ notes: [...s.notes, note].slice(-MAX_NOTES) }))
    notify(
      'info',
      st.role === 'host' ? 'Note from phone' : 'Note from desktop',
      note.text.length > 90 ? `${note.text.slice(0, 90)}…` : note.text,
    )
    playChime()
  })

  socket.on('beam:note:error', (data: { message: string }) => {
    if (data?.message) notify('error', 'Note not delivered', data.message)
  })

  socket.on('beam:extended', (data: { expiresAt: number }) => {
    const st = useBeamStore.getState()
    if (!st.session || typeof data?.expiresAt !== 'number' || !Number.isFinite(data.expiresAt)) return
    useBeamStore.setState({ session: { ...st.session, expiresAt: data.expiresAt } })
    notify('success', 'Session extended', 'Fresh countdown — keep everything open to stay paired.')
  })

  socket.on('beam:extend:declined', () => {
    notify('info', 'Cannot extend yet', 'Sessions can be extended during the last 5 minutes.')
  })

  socket.on('beam:expired', () => {
    destroyPeer()
    useBeamStore.setState({ phase: 'expired', mode: 'none', peerDevice: null })
  })

  socket.on('disconnect', (reason: string) => {
    const st = useBeamStore.getState()
    if (st.phase === 'connected' || st.phase === 'connecting') {
      destroyPeer()
      useBeamStore.setState({ mode: 'none' })
      if (st.role === 'guest') {
        useBeamStore.setState({ phase: 'lost', error: { title: 'Connection lost', message: 'Your connection was interrupted. Reconnecting…' } })
      }
    }
  })

  return socket
}

function emitJoin(): void {
  const st = useBeamStore.getState()
  if (!st.session || !st.role || !socket) return
  if (joinSentFor === st.session.code) return
  joinSentFor = st.session.code
  socket.emit('beam:join', {
    code: st.session.code,
    token: st.session.token,
    role: st.role,
    device: getDeviceInfo(),
  })
}

/* ------------------------------------------------------------------ */
/* Store                                                              */
/* ------------------------------------------------------------------ */

const initialState: BeamState = {
  role: null,
  phase: 'idle',
  error: null,
  session: null,
  ttlMinutes: SESSION_TTL_MINUTES,
  selectedFiles: [],
  manifest: [],
  mobileFiles: [],
  incomingFiles: [],
  transfers: {},
  received: [],
  notes: [],
  mode: 'none',
  peerDevice: null,
  connectedAt: null,
  stats: { filesTransferred: 0, totalData: 0 },
}

export const useBeamStore = create<BeamStore>()((set, get) => ({
  ...initialState,

  /* ---------------- desktop: file selection ---------------- */

  addFiles(files: FileList | File[]) {
    const list = Array.from(files)
    const { accepted, rejections } = validateFiles(list, get().selectedFiles.reduce((a, f) => a + f.size, 0))
    for (const r of rejections) notify('error', 'Cannot add file', `${r.name} — ${r.reason}`)
    if (accepted.length === 0) return

    const newFiles: SelectedFile[] = accepted.map((file) => ({
      id: genId(),
      name: file.name,
      size: file.size,
      type: file.type,
      file,
      previewUrl: makePreviewUrl(file),
    }))
    for (const f of newFiles) fileObjects.set(f.id, f.file)

    set((s) => ({ selectedFiles: [...s.selectedFiles, ...newFiles] }))

    const st = get()
    if (!st.session && st.phase !== 'creating') {
      void get().createNewSession()
    } else {
      publishManifestIfHost()
    }
  },

  removeSelectedFile(id: string) {
    const file = get().selectedFiles.find((f) => f.id === id)
    if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl)
    fileObjects.delete(id)
    // cancel any queued/active transfer of this file
    Object.values(get().transfers).forEach((row) => {
      if (row.fileId === id && (row.status === 'queued' || row.status === 'active')) {
        canceledIds.add(row.id)
        emitCode('beam:transfer:cancel', { transferId: row.id })
        patchTransfer(row.id, { status: 'canceled' })
      }
    })
    set((s) => ({ selectedFiles: s.selectedFiles.filter((f) => f.id !== id) }))
    publishManifestIfHost()
  },

  reorderSelectedFiles(fromId: string, toId: string) {
    const files = [...get().selectedFiles]
    const from = files.findIndex((f) => f.id === fromId)
    const to = files.findIndex((f) => f.id === toId)
    if (from === -1 || to === -1 || from === to) return
    const [moved] = files.splice(from, 1)
    files.splice(to, 0, moved)
    set({ selectedFiles: files })
    publishManifestIfHost()
  },

  setTtlMinutes(minutes: number) {
    const clamped = Math.min(60, Math.max(1, Math.round(minutes)))
    const st = get()
    if (st.phase === 'connected' || st.phase === 'connecting' || st.phase === 'creating') return
    set({ ttlMinutes: clamped })
    // Session already live but the phone hasn't paired yet: recreate it so
    // the QR link carries the new expiry. Files are kept; transfers/received
    // are empty in this phase, so the reset is lossless.
    if (st.session && st.role === 'host' && st.selectedFiles.length > 0) {
      void get().createNewSession()
    }
  },

  /* ---------------- desktop: session lifecycle ---------------- */

  async createNewSession() {
    const files = get().selectedFiles
    if (files.length === 0) return
    if (get().phase === 'creating') return

    destroyPeer()
    sendQueue = []
    sendActive = false
    const ttlMinutes = get().ttlMinutes
    set({ ...initialState, selectedFiles: files, role: 'host', phase: 'creating', ttlMinutes })

    try {
      const metas = files.map((f) => ({ id: f.id, name: f.name, size: f.size, type: f.type }))
      const res = await api.createSession(metas, ttlMinutes)
      const joinUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/?s=${encodeURIComponent(res.code)}&t=${encodeURIComponent(res.token)}`
          : ''
      set({
        session: { code: res.code, token: res.token, expiresAt: res.expiresAt, joinUrl },
        role: 'host',
      })
      ensureSocket()
      if (socket?.connected) emitJoin()
    } catch (err) {
      const { title, message } = api.friendlyError(err)
      set({ phase: 'failed', error: { title, message } })
    }
  },

  async endSession() {
    const st = get()
    if (st.session && st.role === 'host') {
      emitCode('beam:end', {})
      void api.endSession(st.session.code, st.session.token).catch(() => undefined)
    } else if (st.session) {
      emitCode('beam:end', {})
    }
    destroyPeer()
    socket?.disconnect()
    socket = null
    set({ phase: 'ended', mode: 'none', peerDevice: null, connectedAt: null })
  },

  resetAll() {
    destroyPeer()
    socket?.disconnect()
    socket = null
    joiningCode = null
    joinSentFor = null
    sendQueue = []
    sendActive = false
    sinks.clear()
    ackWaiters.clear()
    canceledIds.clear()
    samples.clear()
    lastSpeed.clear()
    get().selectedFiles.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl))
    set({ ...initialState })
  },

  /* ---------------- phone: session open ---------------- */

  async openSession(code: string, token: string) {
    // Idempotence guard (StrictMode double-mount / re-render)
    if (joiningCode === code && ['opening', 'connecting'].includes(get().phase)) return
    if (get().role === 'guest' && get().session?.code === code && ['connected', 'connecting', 'lost'].includes(get().phase)) return

    set({ ...initialState, role: 'guest', phase: 'opening', session: { code, token, expiresAt: 0, joinUrl: '' } })
    joiningCode = code

    try {
      const info = await api.getSession(code, token)
      if (info.session.status !== 'active') {
        set({
          phase: info.session.status === 'expired' ? 'expired' : 'invalid',
          error: { title: 'Session unavailable', message: 'This session is no longer active.' },
        })
        joiningCode = null
        return
      }
      set({ manifest: info.session.fileManifest ?? [] })
      ensureSocket()
      if (socket?.connected) emitJoin()
    } catch (err) {
      const { title, message } = api.friendlyError(err)
      const isExpiry = title === 'Session not found' || title === 'Session expired'
      set({
        phase: isExpiry ? 'invalid' : 'failed',
        error: { title, message },
      })
      joiningCode = null
    }
  },

  reconnect() {
    const st = get()
    if (st.role !== 'guest' || !st.session) return
    joiningCode = null
    joinSentFor = null
    set({ phase: 'opening', error: null })
    ensureSocket()
    if (!socket?.connected) {
      // socket.io will auto-reconnect and emitJoin on 'connect'
      socket?.connect()
    } else {
      emitJoin()
    }
    set({ phase: 'connecting' })
  },

  /* ---------------- phone: download ---------------- */

  requestDownload(fileId: string) {
    const st = get()
    if (st.phase !== 'connected') {
      notify('info', 'Not connected', 'Wait until the connection is ready, then try again.')
      return
    }
    const file = st.manifest.find((f) => f.id === fileId)
    if (!file) return
    const transferId = genId()
    upsertRow(transferId, {
      id: transferId,
      fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      direction: 'd2p',
      status: 'queued',
      transferred: 0,
      speed: 0,
      etaSec: null,
      startedAt: null,
      error: null,
      transport: null,
    })
    emitCode('beam:transfer:request', { transferId, fileId, direction: 'd2p' })
  },

  downloadAll() {
    const st = get()
    const done = new Set(
      Object.values(st.transfers)
        .filter((t) => t.direction === 'd2p' && t.status === 'done')
        .map((t) => t.fileId),
    )
    const pending = st.manifest.filter((f) => !done.has(f.id))
    if (pending.length === 0) {
      notify('info', 'All files downloaded', 'Every file in this session is already on your device.')
      return
    }
    // Small stagger keeps the send queue orderly
    pending.forEach((f, i) => setTimeout(() => get().requestDownload(f.id), i * 400))
  },

  /* ---------------- phone: send to desktop ---------------- */

  addMobileFiles(files: FileList | File[]) {
    const list = Array.from(files)
    const { accepted, rejections } = validateFiles(list, get().mobileFiles.reduce((a, f) => a + f.size, 0))
    for (const r of rejections) notify('error', 'Cannot send file', `${r.name} — ${r.reason}`)
    if (accepted.length === 0) return

    const newFiles: SelectedFile[] = accepted.map((file) => ({
      id: genId(),
      name: file.name,
      size: file.size,
      type: file.type,
      file,
      previewUrl: makePreviewUrl(file),
    }))
    for (const f of newFiles) fileObjects.set(f.id, f.file)
    set((s) => ({ mobileFiles: [...s.mobileFiles, ...newFiles] }))

    const st = get()
    if (st.session && st.role === 'guest' && ['connected', 'connecting'].includes(st.phase)) {
      emitCode('beam:incoming', {
        files: st.mobileFiles.map((f) => ({ id: f.id, name: f.name, size: f.size, type: f.type })),
      })
    }
  },

  removeMobileFile(id: string) {
    const file = get().mobileFiles.find((f) => f.id === id)
    if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl)
    fileObjects.delete(id)
    Object.values(get().transfers).forEach((row) => {
      if (row.fileId === id && (row.status === 'queued' || row.status === 'active')) {
        canceledIds.add(row.id)
        emitCode('beam:transfer:cancel', { transferId: row.id })
        patchTransfer(row.id, { status: 'canceled' })
      }
    })
    set((s) => ({ mobileFiles: s.mobileFiles.filter((f) => f.id !== id) }))
    const st = get()
    if (st.session && st.role === 'guest' && ['connected', 'connecting'].includes(st.phase)) {
      emitCode('beam:incoming', {
        files: get().mobileFiles.map((f) => ({ id: f.id, name: f.name, size: f.size, type: f.type })),
      })
    }
  },

  /* ---------------- shared ---------------- */

  saveReceived(id: string) {
    const file = get().received.find((r) => r.id === id)
    if (!file) return
    triggerDownload(file.url, file.name)
    notify('success', 'Saved', `${file.name} was saved to your downloads.`)
  },

  async shareReceived(id: string) {
    const file = get().received.find((r) => r.id === id)
    if (!file) return
    try {
      const blob = await fetch(file.url).then((r) => r.blob())
      const shareFile = new File([blob], file.name, { type: file.type || blob.type })
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
      if (nav.share && nav.canShare?.({ files: [shareFile] })) {
        await nav.share({ files: [shareFile], title: file.name })
        return
      }
      triggerDownload(file.url, file.name)
    } catch {
      // user cancelled or unsupported
    }
  },

  dismissReceived(id: string) {
    const file = get().received.find((r) => r.id === id)
    if (file) URL.revokeObjectURL(file.url)
    set((s) => ({ received: s.received.filter((r) => r.id !== id) }))
  },

  sendNote(text: string) {
    const trimmed = text.replace(/\s+$/g, '').trim()
    if (!trimmed) return
    const st = get()
    if (!st.session || st.phase !== 'connected') {
      notify('info', 'Not connected', 'Notes can be sent once both devices are paired.')
      return
    }
    if (trimmed.length > LIMITS.MAX_NOTE_CHARS) {
      notify('error', 'Note too long', `Keep notes under ${(LIMITS.MAX_NOTE_CHARS / 1000).toFixed(0)}k characters.`)
      return
    }
    emitCode('beam:note', { text: trimmed })
    // Local echo — the sender sees their own note immediately.
    const note: BeamNote = {
      id: genId(),
      text: trimmed,
      from: st.role === 'guest' ? 'guest' : 'host',
      at: Date.now(),
    }
    set((s) => ({ notes: [...s.notes, note].slice(-MAX_NOTES) }))
  },

  extendSession() {
    const st = get()
    if (st.role !== 'host' || !st.session) return
    if (!['waiting', 'connecting', 'connected'].includes(st.phase)) return
    emitCode('beam:extend', {})
  },

  retryTransfer(transferId: string) {
    const row = get().transfers[transferId]
    if (!row || row.status === 'active') return
    const st = get()
    if (row.direction === 'p2d' && !fileObjects.has(row.fileId)) {
      notify('error', 'Cannot retry', `${row.name} is no longer selected on this device.`)
      return
    }
    const newId = genId()
    upsertRow(newId, { ...row, id: newId, status: 'queued', transferred: 0, speed: 0, etaSec: null, startedAt: null, error: null, transport: null })
    patchTransfer(transferId, { status: 'canceled' })
    emitCode('beam:transfer:request', { transferId: newId, fileId: row.fileId, direction: row.direction })
    if (row.direction === 'p2d' && st.role === 'guest') {
      // The request only queues a row on the desktop — we own the bytes,
      // so start pushing locally as well.
      enqueueSend(newId, row.fileId)
    }
  },

  cancelTransfer(transferId: string) {
    canceledIds.add(transferId)
    emitCode('beam:transfer:cancel', { transferId })
    patchTransfer(transferId, { status: 'canceled', speed: 0 })
  },

  markExpiredIfDue() {
    const st = get()
    if (st.session && st.session.expiresAt > 0 && Date.now() >= st.session.expiresAt) {
      if (st.phase !== 'expired' && st.phase !== 'ended') {
        destroyPeer()
        set({ phase: 'expired', mode: 'none', peerDevice: null })
      }
    }
  },
}))

/** For tests / debugging */
export function _getRuntimeSocket(): Socket | null {
  return socket
}

// Debug/testing hook — lets QA tooling inspect (and drive) the live store.
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__beam = {
    getState: () => useBeamStore.getState(),
    store: useBeamStore, // QA only: full zustand API (setState, subscribe, …)
    debug: beamDebug,
    storeId: Math.random().toString(36).slice(2, 8),
    version: 5,
  }
}
