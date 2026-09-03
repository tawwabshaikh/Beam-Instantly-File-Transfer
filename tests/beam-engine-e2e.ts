/// <reference types="bun-types" />
/**
 * Beam engine E2E test — runs the REAL engine (host role) in Bun against the
 * real session service, with a raw socket.io guest simulating the phone.
 *
 * Covers: session create via Next proxy → guest join → relay fallback
 * (no RTCPeerConnection in Bun forces the relay path) → desktop→phone
 * chunked transfer → phone→desktop transfer → received-file verification.
 *
 * Run: NEXT_PUBLIC_SIGNALING_WS_URL=http://127.0.0.1:3003 \
 *      NEXT_PUBLIC_REST_BASE_URL=http://127.0.0.1:3000 \
 *      bun run tests/beam-engine-e2e.ts
 */

import { io, type Socket } from 'socket.io-client'

const SERVICE = process.env.NEXT_PUBLIC_SIGNALING_WS_URL ?? 'http://127.0.0.1:3003'
const TIMEOUT = 30_000

function fail(msg: string): never {
  console.error(`❌ ${msg}`)
  process.exit(1)
}

async function main() {
  const { useBeamStore } = await import('../src/lib/beam/engine')

  // ---------- 1. Host adds files (engine creates the session) ----------
  const payloadA = new TextEncoder().encode('A'.repeat(200_000) + 'TAIL_A')
  const payloadB = new TextEncoder().encode('B'.repeat(50_000) + 'TAIL_B')
  useBeamStore.getState().addFiles([
    new File([payloadA], 'engine-test-a.bin', { type: 'application/octet-stream' }),
    new File([payloadB], 'engine-test-b.txt', { type: 'text/plain' }),
  ])

  const deadline = Date.now() + TIMEOUT
  while (Date.now() < deadline) {
    const st = useBeamStore.getState()
    if (st.session && st.phase === 'waiting') break
    if (st.phase === 'failed') fail(`session create failed: ${st.error?.message}`)
    await Bun.sleep(200)
  }
  const session = useBeamStore.getState().session
  if (!session) fail('no session created in time')
  console.log(`✅ session created code=${session.code} files=${useBeamStore.getState().selectedFiles.length}`)

  // ---------- 2. Guest joins (raw socket.io client) ----------
  const guest: Socket = io(SERVICE, { path: '/', transports: ['websocket'] })
  const guestEvents: string[] = []
  const chunks: { buf: Uint8Array; transferId: string }[] = []
  let mode: string | null = null

  const waitFor = <T,>(check: () => T | null, what: string): Promise<T> =>
    new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(`timeout waiting for ${what}`)), TIMEOUT)
      const iv = setInterval(() => {
        const v = check()
        if (v !== null && v !== undefined) {
          clearTimeout(to)
          clearInterval(iv)
          resolve(v)
        }
      }, 100)
    })

  let guestManifest: { id: string; name: string; size: number }[] = []
  guest.on('beam:joined', (d: { ok: boolean; session?: { fileManifest?: { id: string; name: string; size: number }[] } }) => {
    if (!d?.ok) fail(`guest join failed: ${JSON.stringify(d)}`)
    guestManifest = d.session?.fileManifest ?? []
    guestEvents.push('joined')
  })
  guest.on('beam:error', (d: unknown) => fail(`guest beam:error ${JSON.stringify(d)}`))
  guest.on('beam:manifest', (d: { files: { id: string; name: string; size: number }[] }) => guestEvents.push(`manifest:${d.files.length}`))
  guest.on('beam:mode', (d: { mode: string }) => {
    mode = d.mode
    guestEvents.push(`mode:${d.mode}`)
  })
  guest.on('beam:transfer:start', (d: { transferId: string; file: { id: string; name: string; size: number } }) =>
    guestEvents.push(`start:${d.file.name}:${d.file.size}`),
  )
  guest.on('beam:transfer:chunk', (d: { transferId: string; seq: number; data: ArrayBuffer }) => {
    chunks.push({ buf: new Uint8Array(d.data.slice(0)), transferId: d.transferId })
    guest.emit('beam:transfer:ack', { code: session.code, transferId: d.transferId, seq: d.seq })
  })
  guest.on('beam:transfer:done', (d: { transferId: string }) => guestEvents.push(`done:${d.transferId}`))
  guest.on('beam:transfer:error', (d: { transferId: string; message: string }) => fail(`guest transfer error: ${d.message}`))

  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('guest connect timeout')), 10_000)
    guest.on('connect', () => {
      clearTimeout(to)
      resolve()
    })
  })
  guest.emit('beam:join', {
    code: session.code,
    token: session.token,
    role: 'guest',
    device: { platform: 'iPhone', browser: 'Safari', isMobile: true },
  })

  // Engine (host, in Bun) has no RTCPeerConnection → must fall back to relay
  await waitFor(() => (mode === 'relay' ? mode : null), 'relay mode')
  const stMode = await waitFor(
    () => (useBeamStore.getState().phase === 'connected' ? useBeamStore.getState().mode : null),
    'host connected',
  )
  if (stMode !== 'relay') fail(`host should be in relay mode, got ${stMode}`)
  console.log('✅ guest joined; engine fell back to relay automatically; both sides connected')

  const manifest = await waitFor(() => (guestManifest.length > 0 ? guestManifest.length : null), 'manifest')
  if (manifest !== 2) fail(`expected manifest of 2, got ${manifest}`)
  const manifestA = guestManifest.find((f) => f.name === 'engine-test-a.bin')
  if (!manifestA) fail('file A missing from guest manifest')
  const localA = useBeamStore.getState().selectedFiles.find((f) => f.name === 'engine-test-a.bin')
  if (manifestA.id !== localA?.id) fail(`file id mismatch: guest=${manifestA.id} host=${localA?.id}`)
  console.log(`✅ manifest delivered to guest, ids preserved (${manifestA.id.slice(0, 8)}…)`)

  // ---------- 3. Guest requests file A (desktop → phone) ----------
  const fileA = localA
  if (!fileA) fail('file A missing on host')
  const doneSeen = waitFor(() => guestEvents.find((e) => e.startsWith('done:')) ?? null, 'transfer done (d2p)')
  guest.emit('beam:transfer:request', { code: session.code, transferId: 't-d2p-1', fileId: fileA.id, direction: 'd2p' })

  await doneSeen
  const bytes = new Uint8Array(chunks.reduce((a, c) => a + c.buf.byteLength, 0))
  let off = 0
  for (const c of chunks) {
    bytes.set(c.buf, off)
    off += c.buf.byteLength
  }
  const text = new TextDecoder().decode(bytes)
  if (text.length !== payloadA.length || !text.endsWith('TAIL_A') || !text.startsWith('A'.repeat(100)))
    fail(`d2p payload mismatch: got ${text.length} bytes`)
  console.log(`✅ desktop→phone: ${chunks.length} relay chunks reassembled to ${bytes.byteLength} bytes, payload intact`)

  // ---------- 4. Guest sends a file to the desktop (phone → desktop) ----------
  chunks.length = 0
  guestEvents.length = 0
  const guestPayload = new Uint8Array(300_000 + 7)
  for (let i = 0; i < guestPayload.length; i++) guestPayload[i] = i % 251
  const CHUNK = 128 * 1024

  guest.on('beam:transfer:request', (d: { transferId: string; fileId: string; direction: string }) => {
    if (d.direction !== 'p2d') return
    // Relay sender with sliding window of 6
    const total = guestPayload.length
    let sent = 0
    let inflight = 0
    const pump = () => {
      while (inflight < 6 && sent < total) {
        const end = Math.min(sent + CHUNK, total)
        const sliceBuf = guestPayload.slice(sent, end)
        guest.emit('beam:transfer:chunk', {
          code: session.code,
          transferId: d.transferId,
          seq: sent / CHUNK,
          data: sliceBuf.buffer.slice(sliceBuf.byteOffset, sliceBuf.byteOffset + sliceBuf.byteLength),
        })
        inflight++
        sent = end
      }
      if (sent >= total && inflight === 0) {
        guest.emit('beam:transfer:done', { code: session.code, transferId: d.transferId })
      }
    }
    guest.emit('beam:transfer:start', {
      code: session.code,
      transferId: d.transferId,
      direction: 'p2d',
      file: { id: d.fileId, name: 'guest-photo.jpg', size: guestPayload.length, type: 'image/jpeg' },
    })
    pump()
    guest.on('beam:transfer:ack', () => {
      inflight--
      pump()
    })
  })

  guest.emit('beam:incoming', {
    code: session.code,
    files: [{ id: 'guest-file-1', name: 'guest-photo.jpg', size: guestPayload.length, type: 'image/jpeg' }],
  })

  await waitFor(
    () => {
      const rec = useBeamStore.getState().received.find((r) => r.name === 'guest-photo.jpg')
      return rec ?? null
    },
    'host received guest file',
  )
  const received = useBeamStore.getState().received.find((r) => r.name === 'guest-photo.jpg')!
  const blob = await fetch(received.url).then((r) => r.blob())
  const got = new Uint8Array(await blob.arrayBuffer())
  if (got.length !== guestPayload.length) fail(`p2d size mismatch ${got.length} vs ${guestPayload.length}`)
  for (let i = 0; i < got.length; i += 4099) {
    if (got[i] !== guestPayload[i]) fail(`p2d payload mismatch at byte ${i}`)
  }
  console.log(`✅ phone→desktop: engine received ${got.length} bytes, payload verified byte-exact`)
  console.log(`✅ stats: ${JSON.stringify(useBeamStore.getState().stats)}`)

  guest.disconnect()
  console.log('🎉 ALL ENGINE E2E TESTS PASSED')
  process.exit(0)
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err))
})
