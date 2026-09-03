'use client'

import { ArrowRightLeft, Cpu, FileWarning, Globe2, KeyRound, Lock, QrCode, ShieldCheck, Timer, Trash2, WifiOff } from 'lucide-react'

const SECURITY_ITEMS = [
  {
    icon: KeyRound,
    title: 'One-time pairing',
    body: 'Every session generates a fresh 6-character code plus a cryptographic token. The token is stored only as a SHA-256 hash — the raw value lives exclusively inside your QR link.',
  },
  {
    icon: Timer,
    title: '10-minute expiry',
    body: 'Sessions self-destruct after 10 minutes. Once expired, the QR link is useless — scans fail safely and the session is wiped from memory.',
  },
  {
    icon: Lock,
    title: 'Encrypted in transit',
    body: 'The site is served over HTTPS, signaling runs over TLS-secured WebSockets, and peer-to-peer transfers are encrypted by WebRTC (DTLS) by default.',
  },
  {
    icon: Trash2,
    title: 'Zero file storage',
    body: 'Beam never stores your files. Peer-to-peer data goes device-to-device; the relay fallback is a pure memory pipe — chunks are forwarded and forgotten.',
  },
  {
    icon: FileWarning,
    title: 'Type & size guards',
    body: 'Executable files are rejected, sizes are capped (2 GB per file, 4 GB per session), and every transfer is authorized against the session token.',
  },
  {
    icon: ShieldCheck,
    title: 'Rate limiting',
    body: 'Session creation, pairing attempts, and data channels are all rate-limited to block brute-force and abuse.',
  },
]

const TECH_ITEMS = [
  { icon: QrCode, label: 'QR pairing', body: 'High error-correction codes generated on-device' },
  { icon: ArrowRightLeft, label: 'WebRTC DataChannels', body: 'Direct P2P transport with chunked streaming' },
  { icon: WifiOff, label: 'Relay fallback', body: 'Automatic secure relay when NAT/firewall blocks P2P' },
  { icon: Globe2, label: 'STUN / TURN ready', body: 'Configurable ICE infrastructure via environment' },
  { icon: Cpu, label: 'Socket.io signaling', body: 'Isolated session service, horizontally scalable design' },
]

export function AboutView() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">About Beam</h1>
        <p className="mt-3 text-muted-foreground">
          Beam is a browser-based file transfer tool for the moment you think “I’ll just email it to myself.”
          Pick a file, scan a QR code with your phone, done — in both directions, across any networks.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">How it works under the hood</h2>
        <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <Step n={1} />
              <span><strong className="text-foreground">Session created.</strong> Your desktop generates a temporary session (code + token, 10-minute TTL) on the signaling service. File names and sizes are registered — never contents.</span>
            </li>
            <li className="flex gap-3">
              <Step n={2} />
              <span><strong className="text-foreground">Phone scans.</strong> The QR encodes a one-time URL. Your phone’s browser validates the token and pairs with the desktop over a TLS WebSocket.</span>
            </li>
            <li className="flex gap-3">
              <Step n={3} />
              <span><strong className="text-foreground">Direct transfer.</strong> Both devices negotiate a WebRTC peer connection. Files stream through encrypted data channels in 16 KB chunks with backpressure — large videos never sit in memory at once.</span>
            </li>
            <li className="flex gap-3">
              <Step n={4} />
              <span><strong className="text-foreground">Relay if needed.</strong> If strict NATs or firewalls block the direct route, Beam silently switches to a server-side relay pipe. Same UI, same security, no user action.</span>
            </li>
          </ol>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Security model</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECURITY_ITEMS.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <item.icon className="h-4.5 w-4.5" aria-hidden />
              </span>
              <h3 className="mt-3 font-medium">{item.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Technology</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TECH_ITEMS.map((t) => (
            <li key={t.label} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 rounded-2xl border border-border bg-muted/40 p-5">
        <h2 className="text-sm font-semibold">Privacy promise</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your transfer history lives in <em>your</em> browser’s local storage and can be cleared at any time on the
          History page. No accounts, no tracking, no permanent URLs — files exist only on the devices that exchanged them.
        </p>
      </section>
    </div>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {n}
    </span>
  )
}
