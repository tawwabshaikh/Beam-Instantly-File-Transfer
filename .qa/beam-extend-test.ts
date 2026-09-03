/* Service-level test: scaled beam:extend window (min(5min, ttl/3)) */
import { io, Socket } from 'socket.io-client'

const SERVICE = 'http://127.0.0.1:3003'
let pass = 0, fail = 0
function ok(cond: boolean, name: string) {
  if (cond) { pass++; console.log('✅', name) } else { fail++; console.log('❌', name) }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function createSession(ttlMinutes: number, files = [{ id: 'f1', name: 'a.bin', size: 10, type: 'application/octet-stream' }]) {
  const res = await fetch(`${SERVICE}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ files, ttlMinutes }),
  })
  return (await res.json()) as { code: string; token: string; expiresAt: number }
}

function connect(): Socket {
  return io(SERVICE, { path: '/', transports: ['websocket'] })
}

function join(sock: Socket, code: string, token: string, role: 'host' | 'guest'): Promise<void> {
  return new Promise((resolve, reject) => {
    sock.once('beam:joined', (d: any) => d?.ok ? resolve() : reject(new Error('join failed')))
    sock.once('beam:error', (e: any) => reject(new Error(e?.message)))
    sock.emit('beam:join', { code, token, role, device: { platform: 'test', browser: 'bun', isMobile: role === 'guest' } })
  })
}

/** Try one extend; resolve with 'accepted' | 'declined' | 'silent' (no reply). */
function tryExtend(sock: Socket, code: string): Promise<'accepted' | 'declined' | 'silent'> {
  return new Promise((resolve) => {
    let done = false
    const t = setTimeout(() => { if (!done) { done = true; resolve('silent') } }, 2000)
    sock.once('beam:extended', () => { if (!done) { done = true; clearTimeout(t); resolve('accepted') } })
    sock.once('beam:extend:declined', () => { if (!done) { done = true; clearTimeout(t); resolve('declined') } })
    sock.emit('beam:extend', { code })
  })
}

async function main() {
  // ---- A: ttl=10 fresh — remaining 10min > 5min window → declined ----
  const sA = await createSession(10)
  const hA = connect()
  await join(hA, sA.code, sA.token, 'host')
  ok((await tryExtend(hA, sA.code)) === 'declined', 'A: ttl=10 fresh → declined (10min > 5min window)')
  hA.disconnect()

  // ---- B: ttl=1 fresh — remaining 60s > 20s window (ttl/3) → declined (NEW semantics) ----
  const sB = await createSession(1)
  const hB = connect()
  await join(hB, sB.code, sB.token, 'host')
  const first = await tryExtend(hB, sB.code)
  ok(first === 'declined', `B: ttl=1 fresh → declined (60s > 20s window) [got ${first}]`)

  // ---- C: ttl=1 after ~42s — remaining ~18s ≤ 20s window → accepted ----
  const accepted = (async () => {
    for (let i = 0; i < 50; i++) {
      const r = await tryExtend(hB, sB.code)
      if (r === 'accepted') return true
      if (r === 'silent') return false
      await sleep(1000) // declined → wait and retry
    }
    return false
  })()
  const okC = await Promise.race([accepted, sleep(55_000).then(() => false)])
  ok(okC, 'C: ttl=1 after ~42s → accepted (remaining ≤ ttl/3 window)')
  hB.disconnect()

  // ---- D: guest extend silently ignored ----
  const sD = await createSession(1)
  const hD = connect()
  const gD = connect()
  await join(hD, sD.code, sD.token, 'host')
  await join(gD, sD.code, sD.token, 'guest')
  const hostGotEvent = new Promise<string>((resolve) => {
    hD.once('beam:extended', () => resolve('extended'))
    hD.once('beam:extend:declined', () => resolve('declined'))
    setTimeout(() => resolve('silent'), 1500)
  })
  gD.emit('beam:extend', { code: sD.code })
  const ev = await hostGotEvent
  ok(ev === 'silent', `D: guest extend ignored (host-only) [got ${ev}]`)
  hD.disconnect(); gD.disconnect()

  // ---- E: ttl=15 fresh — declined, decline message mentions minutes ----
  const sE = await createSession(15)
  const hE = connect()
  await join(hE, sE.code, sE.token, 'host')
  let eMsg = ''
  hE.once('beam:extend:declined', (d: any) => { eMsg = d?.message ?? '' })
  hE.emit('beam:extend', { code: sE.code })
  await sleep(800)
  ok(/minute/.test(eMsg), `E: decline message scaled (${eMsg || 'EMPTY'})`)
  hE.disconnect()

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
