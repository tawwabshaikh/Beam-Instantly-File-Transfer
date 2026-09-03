'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Camera,
  CheckCircle2,
  CloudOff,
  Clock,
  Download,
  FilePlus2,
  Loader2,
  MonitorSmartphone,
  Plus,
  RotateCcw,
  Share2,
  ShieldCheck,
  Timer,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SESSION_TTL_MINUTES } from '@/lib/beam/config'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { useBeamStore, type TransferRow } from '@/lib/beam/engine'
import { formatBytes, formatCountdown, formatSpeed } from '@/lib/beam/format'
import { Logo } from '@/components/beam/logo'
import { FileTypeIcon } from '@/components/beam/desktop/dropzone'
import { TransferRowItem } from '@/components/beam/desktop/session-panel'
import { NotesPanel } from '@/components/beam/shared/notes-panel'
import { useCountdown } from '@/hooks/use-countdown'
import { useSoundMuted } from '@/hooks/use-sound-muted'
import { cn } from '@/lib/utils'

/**
 * Phone experience — opened by scanning the desktop's QR code.
 * Single-screen, thumb-friendly, all 11 lifecycle states.
 */
export function MobileSession({ code, token }: { code: string; token: string }) {
  const phase = useBeamStore((s) => s.phase)
  const session = useBeamStore((s) => s.session)
  const openSession = useBeamStore((s) => s.openSession)
  const resetAll = useBeamStore((s) => s.resetAll)

  useEffect(() => {
    void openSession(code, token)
    return () => resetAll()
  }, [code, token, openSession, resetAll])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MobileHeader code={code} expiresAt={session?.expiresAt ?? 0} />

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-5 safe-bottom">
        {phase === 'opening' && <OpeningView />}
        {phase === 'connecting' && <ConnectingView />}
        {(phase === 'connected' ||
          phase === 'waiting' ||
          phase === 'creating' ||
          phase === 'idle') && <ConnectedView />}
        {phase === 'lost' && <LostView />}
        {phase === 'expired' && <ExpiredView />}
        {phase === 'invalid' && <InvalidView />}
        {phase === 'ended' && <EndedView />}
        {phase === 'failed' && <FailedView />}
      </main>

      <footer className="border-t border-border/60 px-4 py-3 text-center text-[11px] text-muted-foreground safe-bottom">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-primary" aria-hidden />
          Encrypted session · Files go device-to-device
        </span>
      </footer>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Header                                                             */
/* ------------------------------------------------------------------ */

function MobileHeader({ code, expiresAt }: { code: string; expiresAt: number }) {
  const remaining = useCountdown(expiresAt)
  const { muted, toggle } = useSoundMuted()

  useEffect(() => {
    if (!expiresAt) return
    const iv = setInterval(() => useBeamStore.getState().markExpiredIfDue(), 1000)
    return () => clearInterval(iv)
  }, [expiresAt])

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-12 w-full max-w-md items-center justify-between px-4">
        <Logo size="sm" />
        <div className="flex items-center gap-1.5">
          <code className="tnum rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold tracking-[0.15em]">
            {code}
          </code>
          {expiresAt > 0 && (
            <span
              className={cn(
                'tnum inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
                remaining < 120_000 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground',
              )}
            >
              <Timer className="h-3 w-3" aria-hidden />
              {formatCountdown(remaining)}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={toggle}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          >
            {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* Transitional states                                                */
/* ------------------------------------------------------------------ */

function OpeningView() {
  return (
    <StateShell>
      <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
      <p className="mt-4 font-medium">Opening session…</p>
      <p className="mt-1 text-sm text-muted-foreground">Validating your secure pairing link</p>
    </StateShell>
  )
}

function ConnectingView() {
  const mode = useBeamStore((s) => s.mode)
  return (
    <StateShell>
      <span className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute inline-flex h-full w-full rounded-full bg-primary/25 animate-beam-ping" />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <MonitorSmartphone className="h-6 w-6 text-primary" aria-hidden />
        </span>
      </span>
      <p className="mt-4 font-medium">Connecting…</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === 'relay' ? 'Routing through secure relay…' : 'Establishing a secure channel to your desktop'}
      </p>
      <ul className="mt-6 w-full space-y-2 text-left text-xs text-muted-foreground" aria-hidden>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Link verified
        </li>
        <li className="flex items-center gap-2">
          {mode === 'none' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          )}
          Pairing with desktop
        </li>
        <li className="flex items-center gap-2">
          {mode === 'none' ? (
            <span className="h-3.5 w-3.5 rounded-full border border-border" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          )}
          Securing transfer channel
        </li>
      </ul>
    </StateShell>
  )
}

/* ------------------------------------------------------------------ */
/* Connected — the main workspace                                     */
/* ------------------------------------------------------------------ */

function ConnectedView() {
  const peerDevice = useBeamStore((s) => s.peerDevice)
  const manifest = useBeamStore((s) => s.manifest)
  const mode = useBeamStore((s) => s.mode)
  const transfers = useBeamStore((s) => s.transfers)
  const [flashIds, setFlashIds] = useState<string[]>([])

  // Highlight rows the desktop added mid-session (engine emits this event)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onManifestUpdate = (e: Event) => {
      const ids = (e as CustomEvent<{ addedIds: string[] }>).detail?.addedIds ?? []
      if (ids.length === 0) return
      setFlashIds(ids)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setFlashIds([]), 2400)
    }
    window.addEventListener('beam:manifest-update', onManifestUpdate)
    return () => {
      window.removeEventListener('beam:manifest-update', onManifestUpdate)
      if (timer) clearTimeout(timer)
    }
  }, [])

  const d2pRows = useMemo(
    () => Object.values(transfers).filter((t) => t.direction === 'd2p'),
    [transfers],
  )
  const p2dRows = useMemo(
    () => Object.values(transfers).filter((t) => t.direction === 'p2d'),
    [transfers],
  )
  const d2pActive = d2pRows.some((r) => r.status === 'active' || r.status === 'queued')
  const p2dActive = p2dRows.some((r) => r.status === 'active' || r.status === 'queued')

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Connection banner */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl border p-4',
          peerDevice ? 'border-primary/30 bg-primary/5' : 'border-border bg-card',
        )}
      >
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MonitorSmartphone className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">Connected to Desktop</p>
          <p className="text-xs text-muted-foreground">
            {peerDevice
              ? 'Your computer is ready to exchange files'
              : 'Waiting for the computer to appear…'}
          </p>
        </div>
        <span className="relative flex h-2.5 w-2.5" aria-label="Connection status: connected">
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary animate-beam-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
      </div>

      {/* Receive: files from desktop */}
      <section aria-label="Files available for download" className="rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ArrowDownToLine className="h-4 w-4 text-primary" aria-hidden />
            From desktop
            {manifest.length > 0 && (
              <span
                key={manifest.length}
                className="tnum animate-pop rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {manifest.length}
              </span>
            )}
          </h2>
          {manifest.length > 1 && (
            <Button size="sm" variant="secondary" className="h-8" onClick={() => useBeamStore.getState().downloadAll()} disabled={d2pActive}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download All
            </Button>
          )}
        </header>

        {manifest.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium">No files yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {peerDevice
                ? 'The desktop hasn’t added any files. Use the send section below to push files to it.'
                : 'Keep this page open — it will connect automatically.'}
            </p>
          </div>
        ) : (
          <ul className="beam-scroll max-h-[46vh] divide-y divide-border/60 overflow-y-auto">
            {manifest.map((file) => (
              <MobileFileRow key={file.id} fileId={file.id} flash={flashIds.includes(file.id)} />
            ))}
          </ul>
        )}

        {d2pRows.length > 0 && (
          <div className="border-t border-border/70">
            <BatchProgress rows={d2pRows} />
            <ul className="divide-y divide-border/60">
              {d2pRows
                .sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0))
                .slice(-6)
                .map((row) => (
                  <TransferRowItem key={row.id} row={row} />
                ))}
            </ul>
          </div>
        )}
      </section>

      {/* Send: files to desktop */}
      <SendToDesktop disabled={!peerDevice || mode === 'none'} rows={p2dRows} active={p2dActive} />

      {/* Text notes — works over relay or P2P, independent of file transfers */}
      <NotesPanel variant="mobile" />

      {mode === 'relay' && (
        <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          Direct connection wasn’t possible — transfers are relaying through Beam’s secure server. Everything stays encrypted.
        </p>
      )}
    </div>
  )
}

/** Aggregate progress for a batch of downloads (e.g. "Download All"). */
function BatchProgress({ rows }: { rows: TransferRow[] }) {
  const relevant = rows.filter((r) => r.status !== 'canceled')
  const total = relevant.reduce((a, r) => a + r.size, 0)
  const done = relevant.reduce((a, r) => a + r.transferred, 0)
  const active = relevant.filter((r) => r.status === 'active' || r.status === 'queued').length
  const finished = relevant.filter((r) => r.status === 'done').length
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0

  if (relevant.length < 2) return null

  return (
    <div className="bg-muted/40 px-4 py-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">
          {active > 0 ? `Downloading ${finished + 1} of ${relevant.length}` : `${finished} of ${relevant.length} downloaded`}
        </span>
        <span className="tnum text-muted-foreground">
          {formatBytes(done)} / {formatBytes(total)}
        </span>
      </div>
      <Progress value={pct} className="mt-1.5 h-1.5" aria-label={`Batch progress ${pct.toFixed(0)}%`} />
    </div>
  )
}

function MobileFileRow({ fileId, flash = false }: { fileId: string; flash?: boolean }) {
  const file = useBeamStore((s) => s.manifest.find((f) => f.id === fileId))
  const transfers = useBeamStore((s) => s.transfers)
  const requestDownload = useBeamStore((s) => s.requestDownload)
  const shareReceived = useBeamStore((s) => s.shareReceived)
  const retryTransfer = useBeamStore((s) => s.retryTransfer)

  const rows = useMemo(
    () =>
      Object.values(transfers).filter((t) => t.fileId === fileId && t.direction === 'd2p'),
    [transfers, fileId],
  )

  if (!file) return null
  const row = rows[rows.length - 1]
  const busy = row && (row.status === 'queued' || row.status === 'active')
  const failed = row?.status === 'error'
  const done = rows.some((r) => r.status === 'done')
  // Once downloaded, images get a real thumbnail from the received blob.
  const receivedThumb = done && file.type.startsWith('image/')
    ? useBeamStore.getState().received.find((r) => r.name === file.name && r.size === file.size)?.url ?? null
    : null

  return (
    <li className={cn('flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40', flash && 'animate-flash')}>
      {receivedThumb ? (
        <img
          src={receivedThumb}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FileTypeIcon type={file.type} name={file.name} className="h-4.5 w-4.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className={cn('tnum truncate text-xs', failed ? 'text-destructive' : 'text-muted-foreground')}>
          {row?.status === 'active'
            ? `${(row.size > 0 ? (row.transferred / row.size) * 100 : 0).toFixed(0)}% · ${formatSpeed(row.speed)}`
            : failed
              ? (row?.error ?? 'Download failed')
              : formatBytes(file.size)}
        </p>
      </div>
      {done ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              const rec = useBeamStore.getState().received.find((r) => r.name === file.name)
              if (rec) void shareReceived(rec.id)
            }}
            aria-label={`Share or re-save ${file.name}`}
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Saved
          </span>
        </div>
      ) : failed ? (
        <Button
          size="sm"
          variant="outline"
          className="h-9 min-w-20 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => retryTransfer(row!.id)}
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Retry
        </Button>
      ) : (
        <Button size="sm" className="h-9 min-w-24" onClick={() => requestDownload(fileId)} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
          {busy ? 'Busy…' : 'Download'}
        </Button>
      )}
    </li>
  )
}

function SendToDesktop({
  disabled,
  rows,
  active,
}: {
  disabled: boolean
  rows: TransferRow[]
  active: boolean
}) {
  const addMobileFiles = useBeamStore((s) => s.addMobileFiles)
  const removeMobileFile = useBeamStore((s) => s.removeMobileFile)
  const retryTransfer = useBeamStore((s) => s.retryTransfer)
  const mobileFiles = useBeamStore((s) => s.mobileFiles)
  const pickRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  return (
    <section aria-label="Send files to desktop" className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="border-b border-border/70 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ArrowUpFromLine className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden />
          Send files to desktop
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Photos, videos, voice notes — they land on your computer</p>
      </header>

      <input
        ref={pickRef}
        type="file"
        multiple
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) addMobileFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) addMobileFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <div className="grid grid-cols-2 gap-2.5 p-4">
        <Button className="h-11" onClick={() => pickRef.current?.click()} disabled={disabled}>
          <Plus className="h-4 w-4" aria-hidden />
          Select Files
        </Button>
        <Button variant="outline" className="h-11" onClick={() => cameraRef.current?.click()} disabled={disabled}>
          <Camera className="h-4 w-4" aria-hidden />
          Camera
        </Button>
      </div>

      {mobileFiles.length > 0 && (
        <ul className="divide-y divide-border/60 border-t border-border/70">
          {mobileFiles.map((f) => {
            const row = rows.filter((r) => r.fileId === f.id).at(-1)
            return (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                {f.previewUrl ? (
                  <img
                    src={f.previewUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <FileTypeIcon type={f.type} name={f.name} className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="tnum text-xs text-muted-foreground">
                    {row?.status === 'active'
                      ? `${(row.size > 0 ? (row.transferred / row.size) * 100 : 0).toFixed(0)}% · ${formatSpeed(row.speed)}`
                      : row?.status === 'done'
                        ? 'Delivered to desktop'
                        : row?.status === 'queued'
                          ? 'Queued…'
                          : row?.status === 'error'
                            ? row.error ?? 'Failed'
                            : formatBytes(f.size)}
                  </p>
                </div>
                {row?.status === 'done' ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-label="Upload completed" />
                ) : row?.status === 'error' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => retryTransfer(row.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Retry
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground"
                    onClick={() => removeMobileFile(f.id)}
                    disabled={row?.status === 'active'}
                    aria-label={`Stop sending ${f.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {active && (
        <p className="tnum border-t border-border/70 px-4 py-2 text-center text-xs text-muted-foreground">
          Uploading to desktop…
        </p>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Problem states                                                     */
/* ------------------------------------------------------------------ */

function LostView() {
  const error = useBeamStore((s) => s.error)
  const reconnect = useBeamStore((s) => s.reconnect)
  return (
    <StateShell tone="border-amber-500/30 bg-amber-500/5">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
        <CloudOff className="h-6 w-6 text-amber-600 dark:text-amber-400" aria-hidden />
      </span>
      <p className="mt-4 font-semibold">Connection lost</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {error?.message ?? 'The connection to your desktop dropped.'}
      </p>
      <Button className="mt-5 min-w-40" onClick={reconnect}>
        <RotateCcw className="h-4 w-4" aria-hidden />
        Reconnect
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">The QR code on your desktop is still valid.</p>
    </StateShell>
  )
}

function ExpiredView() {
  return (
    <StateShell tone="border-amber-500/30 bg-amber-500/5">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
        <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" aria-hidden />
      </span>
      <p className="mt-4 font-semibold">Session expired</p>
      <p className="mt-1 text-sm text-muted-foreground">
        This pairing session expired after {SESSION_TTL_MINUTES} minutes. Ask the desktop for a fresh QR code.
      </p>
      <StartOverLink />
    </StateShell>
  )
}

function InvalidView() {
  const error = useBeamStore((s) => s.error)
  const [manual, setManual] = useState('')
  const openSession = useBeamStore((s) => s.openSession)

  const tryManual = () => {
    const v = manual.trim()
    try {
      const url = new URL(v)
      const s = url.searchParams.get('s')
      const t = url.searchParams.get('t')
      if (s && t) {
        window.location.assign(`/?s=${encodeURIComponent(s)}&t=${encodeURIComponent(t)}`)
        return
      }
    } catch {
      // not a URL
    }
    const m = v.match(/^([A-HJ-NP-Z2-9]{6})-([A-Za-z0-9]{8,128})$/i)
    if (m) {
      window.location.assign(`/?s=${encodeURIComponent(m[1]!.toUpperCase())}&t=${encodeURIComponent(m[2]!)}`)
      return
    }
    window.location.assign('/')
  }

  return (
    <StateShell tone="border-destructive/30 bg-destructive/5">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <CloudOff className="h-6 w-6 text-destructive" aria-hidden />
      </span>
      <p className="mt-4 font-semibold">{error?.title ?? 'Invalid or expired link'}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {error?.message ?? 'This QR link is no longer valid. Scan a fresh code from the desktop.'}
      </p>
      <div className="mt-5 w-full space-y-2">
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Paste pairing link or CODE-KEY"
          aria-label="Pairing link or manual code"
          className="h-11 bg-background text-center"
        />
        <Button className="h-11 w-full" onClick={tryManual}>
          <FilePlus2 className="h-4 w-4" aria-hidden />
          Try pairing key
        </Button>
      </div>
      <StartOverLink />
    </StateShell>
  )
}

function EndedView() {
  return (
    <StateShell tone="border-primary/30 bg-primary/5">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden />
      </span>
      <p className="mt-4 font-semibold">Session ended</p>
      <p className="mt-1 text-sm text-muted-foreground">The desktop closed this transfer session.</p>
      <StartOverLink />
    </StateShell>
  )
}

function FailedView() {
  const error = useBeamStore((s) => s.error)
  const reconnect = useBeamStore((s) => s.reconnect)
  return (
    <StateShell tone="border-destructive/30 bg-destructive/5">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <CloudOff className="h-6 w-6 text-destructive" aria-hidden />
      </span>
      <p className="mt-4 font-semibold">{error?.title ?? 'Something went wrong'}</p>
      <p className="mt-1 text-sm text-muted-foreground">{error?.message ?? 'An unexpected error occurred.'}</p>
      <Button className="mt-5 min-w-40" onClick={reconnect}>
        <RotateCcw className="h-4 w-4" aria-hidden />
        Try again
      </Button>
      <StartOverLink />
    </StateShell>
  )
}

function StartOverLink() {
  return (
    <button
      type="button"
      onClick={() => window.location.assign('/')}
      className="mt-5 text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      Go to Beam home
    </button>
  )
}

function StateShell({
  children,
  tone,
}: {
  children: React.ReactNode
  tone?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-[55vh] flex-col items-center justify-center rounded-2xl border px-6 py-10 text-center animate-fade-up',
        tone ?? 'border-border bg-card',
      )}
    >
      {children}
    </div>
  )
}
