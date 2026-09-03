'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Keyboard, Link2, Loader2, QrCode, RefreshCw, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useBeamStore } from '@/lib/beam/engine'
import { formatCountdown } from '@/lib/beam/format'
import { EXTEND_WINDOW_MS } from '@/lib/beam/protocol'
import { ExtendButton } from '@/components/beam/desktop/session-panel'
import { useCountdown } from '@/hooks/use-countdown'
import { cn } from '@/lib/utils'

/** Generate a high-contrast, error-corrected QR as a data URL. */
function useQrCode(text: string | null): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!text) return
    let alive = true
    QRCode.toDataURL(text, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 512,
      color: { dark: '#111111', light: '#ffffff' },
    })
      .then((url) => alive && setDataUrl(url))
      .catch(() => alive && setDataUrl(null))
    return () => {
      alive = false
    }
  }, [text])
  return text ? dataUrl : null
}

export function QrCard({ variant }: { variant: 'full' | 'compact' }) {
  const session = useBeamStore((s) => s.session)
  const phase = useBeamStore((s) => s.phase)
  const peerDevice = useBeamStore((s) => s.peerDevice)
  const mode = useBeamStore((s) => s.mode)
  const createNewSession = useBeamStore((s) => s.createNewSession)
  const markExpiredIfDue = useBeamStore((s) => s.markExpiredIfDue)

  const remaining = useCountdown(session?.expiresAt ?? 0)
  const qr = useQrCode(session?.joinUrl ?? null)

  // Expire locally the moment the countdown hits zero
  useEffect(() => {
    if (session && remaining === 0) markExpiredIfDue()
  }, [remaining, session, markExpiredIfDue])

  const joined = phase === 'connected'
  const connecting = phase === 'connecting'

  const expiresSoon = remaining > 0 && remaining < 120_000

  if (variant === 'compact') {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm animate-fade-up">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Session</h2>
            <p className="tnum mt-0.5 text-xs text-muted-foreground">
              {session?.code} · expires in {formatCountdown(remaining)}
            </p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <QrCode className="h-4 w-4" aria-hidden />
                Show QR
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Scan to pair another device</DialogTitle>
              </DialogHeader>
              <QrPanel
                qr={qr}
                joinUrl={session?.joinUrl ?? ''}
                code={session?.code ?? ''}
                remaining={remaining}
                expiresSoon={expiresSoon}
                joined
              />
            </DialogContent>
          </Dialog>
        </div>
        {expiresSoon && (
          <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <p>
              {joined
                ? 'Session is ending soon — finishes current transfers, then create a fresh code for the next pair-up.'
                : 'Session is about to expire — extend it to keep the same code and link alive.'}
            </p>
            {!joined && <ExtendButton expiresAt={session?.expiresAt ?? 0} className="mt-2 h-7 w-full" />}
          </div>
        )}
      </div>
    )
  }

  /* ---------------- full variant (waiting / connecting) ---------------- */

  const canExtendHere = remaining > 0 && remaining <= EXTEND_WINDOW_MS && !connecting

  return (
    <section
      aria-label="QR pairing"
      className="flex flex-col items-center rounded-3xl border border-border bg-card p-6 shadow-sm animate-fade-up sm:p-8"
    >
      {connecting ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
          <span className="relative flex h-16 w-16 items-center justify-center">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary/30 animate-beam-ping" />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden />
            </span>
          </span>
          <div>
            <h2 className="text-lg font-semibold">Phone connected</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Establishing a secure channel{mode === 'relay' ? ' via secure relay…' : '…'}
            </p>
          </div>
        </div>
      ) : qr ? (
        <QrPanel
          qr={qr}
          joinUrl={session?.joinUrl ?? ''}
          code={session?.code ?? ''}
          remaining={remaining}
          expiresSoon={expiresSoon}
          joined={false}
        />
      ) : (
        <div className="flex min-h-[320px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      )}

      {/* Footer status / actions */}
      <div className="mt-6 w-full border-t border-border/70 pt-4 text-center">
        {connecting ? (
          <p className="text-sm text-muted-foreground">Almost there — securing the connection.</p>
        ) : peerDevice ? (
          <p className="text-sm text-muted-foreground">Waiting for device to rejoin…</p>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ScanLine className="h-4 w-4 text-primary" aria-hidden />
              Point your phone camera at the code
            </p>
            <button
              type="button"
              onClick={() => void createNewSession()}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              <RefreshCw className="h-3 w-3" aria-hidden />
              Generate a fresh code
            </button>
            {canExtendHere && (
              <p className="mt-1 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                Session expiring soon — the QR stops working at 00:00.
              </p>
            )}
            {canExtendHere && <ExtendButton expiresAt={session?.expiresAt ?? 0} className="h-8" />}
          </div>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* QR panel shared between full card and modal                        */
/* ------------------------------------------------------------------ */

function QrPanel({
  qr,
  joinUrl,
  code,
  remaining,
  expiresSoon,
  joined,
}: {
  qr: string | null
  joinUrl: string
  code: string
  remaining: number
  expiresSoon: boolean
  joined: boolean
}) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const [manualValue, setManualValue] = useState('')
  const [manualHint, setManualHint] = useState<string | null>(null)

  const copy = useMemo(
    () => async (kind: 'link' | 'code', value: string) => {
      try {
        await navigator.clipboard.writeText(value)
        setCopied(kind)
        setTimeout(() => setCopied(null), 1600)
      } catch {
        setCopied(null)
      }
    },
    [],
  )

  return (
    <div className="flex w-full flex-col items-center">
      <div className="relative rounded-2xl bg-white p-3 shadow-inner ring-1 ring-black/5">
        {/* scan-frame corner brackets */}
        <span aria-hidden className="pointer-events-none absolute -left-2 -top-2 h-7 w-7 rounded-tl-xl border-l-[3px] border-t-[3px] border-primary/70" />
        <span aria-hidden className="pointer-events-none absolute -right-2 -top-2 h-7 w-7 rounded-tr-xl border-r-[3px] border-t-[3px] border-primary/70" />
        <span aria-hidden className="pointer-events-none absolute -bottom-2 -left-2 h-7 w-7 rounded-bl-xl border-b-[3px] border-l-[3px] border-primary/70" />
        <span aria-hidden className="pointer-events-none absolute -bottom-2 -right-2 h-7 w-7 rounded-br-xl border-b-[3px] border-r-[3px] border-primary/70" />
        {qr ? (
          <img
            src={qr}
            alt="QR code linking your phone to this Beam session"
            className={cn('block aspect-square w-52 transition-opacity sm:w-60', joined && 'opacity-40')}
          />
        ) : (
          <div className="flex aspect-square w-52 items-center justify-center sm:w-60">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-400" aria-hidden />
          </div>
        )}
        {joined && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">
              Paired
            </span>
          </span>
        )}
      </div>

      <h3 className="mt-4 text-base font-semibold">Scan with your phone</h3>
      <p className={cn('tnum mt-1 text-sm', expiresSoon ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
        Session expires in {formatCountdown(remaining)}
      </p>

      {/* Fallback code */}
      <div className="mt-4 flex w-full flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <code className="tnum rounded-lg border border-border bg-muted px-3 py-1.5 text-base font-semibold tracking-[0.2em]">
            {code}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => void copy('code', code)}
            aria-label="Copy pairing code"
          >
            {copied === 'code' ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => void copy('link', joinUrl)}
            disabled={!joinUrl}
          >
            {copied === 'link' ? <Check className="h-3.5 w-3.5 text-primary" /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
            Copy pairing link
          </Button>
        </div>
      </div>

      {/* Manual entry fallback (for when the camera can't scan) */}
      <details className="mt-4 w-full">
        <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <Keyboard className="h-3.5 w-3.5" aria-hidden />
          Enter code manually on the phone
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <Input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder="e.g. https://…/?s=CODE&t=KEY or CODE-KEY"
            className="h-9 text-xs"
            aria-label="Pairing link or code"
          />
          <Button
            variant="secondary"
            size="sm"
            className="h-8"
            onClick={async () => {
              const v = manualValue.trim()
              try {
                // Accept full URL or CODE-KEY
                const url = new URL(v)
                const s = url.searchParams.get('s')
                const t = url.searchParams.get('t')
                if (s && t) {
                  await navigator.clipboard.writeText(`${s}-${t}`)
                  setManualHint('Copied CODE-KEY — paste it on the phone’s manual entry screen.')
                  return
                }
              } catch {
                // not a URL
              }
              if (/^[A-HJ-NP-Z2-9]{6}-[A-Z2-9]{8,}$/i.test(v)) {
                await navigator.clipboard.writeText(v)
                setManualHint('Copied — paste into the phone’s manual entry screen.')
                return
              }
              setManualHint('Enter the pairing link or a CODE-KEY string.')
            }}
          >
            Prepare for phone
          </Button>
          {manualHint && <p className="text-center text-xs text-muted-foreground">{manualHint}</p>}
        </div>
      </details>
    </div>
  )
}
