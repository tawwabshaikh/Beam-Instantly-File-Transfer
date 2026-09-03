'use client'

import { useEffect, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CircleAlert,
  Download,
  Eye,
  Gauge,
  Files,
  FolderOpen,
  HardDrive,
  Loader2,
  RotateCcw,
  Timer,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useBeamStore, type TransferRow } from '@/lib/beam/engine'
import { formatBytes, formatDuration, formatRelativeTime, formatSpeed } from '@/lib/beam/format'
import { describeDevice } from '@/lib/beam/device'
import { EXTEND_WINDOW_MS } from '@/lib/beam/protocol'
import { FileTypeIcon } from '@/components/beam/desktop/dropzone'
import { SpeedSparkline } from '@/components/beam/speed-sparkline'
import { useCountdown } from '@/hooks/use-countdown'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Dashboard — device, status, statistics                             */
/* ------------------------------------------------------------------ */

export function SessionDashboard() {
  const peerDevice = useBeamStore((s) => s.peerDevice)
  const stats = useBeamStore((s) => s.stats)
  const connectedAt = useBeamStore((s) => s.connectedAt)
  const transfers = useBeamStore((s) => s.transfers)
  const endSession = useBeamStore((s) => s.endSession)
  const session = useBeamStore((s) => s.session)
  const mode = useBeamStore((s) => s.mode)

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!connectedAt) return
    const tick = () => setElapsed(Math.floor((Date.now() - connectedAt) / 1000))
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [connectedAt])

  const rows = Object.values(transfers)
  const activeSpeed = rows.reduce((a, r) => a + (r.status === 'active' ? r.speed : 0), 0)

  return (
    <section aria-label="Active session" className="rounded-2xl border border-border bg-card p-5 shadow-sm animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HardDrive className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold leading-tight">Phone Connected</h2>
            <p className="text-sm text-muted-foreground">{describeDevice(peerDevice)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExtendButton expiresAt={session?.expiresAt ?? 0} />
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void endSession()}
          >
            <X className="h-4 w-4" aria-hidden />
            End Session
          </Button>
        </div>
      </div>

      <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary animate-beam-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        Connected{mode === 'relay' ? ' · secure relay' : ' · peer-to-peer'}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Files} label="Files transferred" value={String(stats.filesTransferred)} />
        <StatCard icon={HardDrive} label="Total data" value={formatBytes(stats.totalData)} />
        <StatCard icon={Gauge} label="Current speed" value={activeSpeed > 0 ? formatSpeed(activeSpeed) : '—'} />
        <StatCard icon={Timer} label="Session time" value={formatDuration(elapsed)} />
      </dl>
    </section>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/50 p-3 transition-colors duration-200 hover:border-primary/30 hover:bg-primary/5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="tnum mt-1 text-lg font-semibold leading-tight">{value}</dd>
    </div>
  )
}

/**
 * Host-only: resets the session countdown back to a full 10 minutes.
 * The service accepts extends only within the last EXTEND_WINDOW_MS,
 * so the control is hidden/disabled outside that window.
 */
export function ExtendButton({ expiresAt, className }: { expiresAt: number; className?: string }) {
  const remaining = useCountdown(expiresAt)
  const extendSession = useBeamStore((s) => s.extendSession)
  const canExtend = expiresAt > 0 && remaining > 0 && remaining <= EXTEND_WINDOW_MS

  if (!expiresAt) return null
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('h-8', className)}
      onClick={extendSession}
      disabled={!canExtend}
      title={canExtend ? 'Reset the session countdown to a fresh 10 minutes' : 'Available during the last 5 minutes'}
    >
      <Timer className="h-4 w-4 text-primary" aria-hidden />
      Extend +10 min
    </Button>
  )
}

/* ------------------------------------------------------------------ */
/* Transfers list (both directions)                                   */
/* ------------------------------------------------------------------ */

export function TransfersList() {
  const transfers = useBeamStore((s) => s.transfers)
  const incomingFiles = useBeamStore((s) => s.incomingFiles)

  const rows = Object.values(transfers).sort((a, b) => {
    const rank = (r: TransferRow) => (r.status === 'active' ? 0 : r.status === 'queued' ? 1 : r.status === 'error' ? 2 : 3)
    return rank(a) - rank(b)
  })
  const aggregateSpeed = rows.reduce((a, r) => a + (r.status === 'active' ? r.speed : 0), 0)

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
        <span
          aria-hidden
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground/70"
        >
          <Files className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-medium">No transfers yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          {incomingFiles.length > 0
            ? 'Receiving files from the phone…'
            : 'Files you select are ready for the phone to download. The phone can also send files back — they’ll appear here.'}
        </p>
      </section>
    )
  }

  return (
    <section aria-label="Transfers" className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          Transfers
          <span className="tnum rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {rows.length}
          </span>
        </h2>
        {aggregateSpeed > 0 && (
          <span className="tnum inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary animate-beam-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            {formatSpeed(aggregateSpeed)}
          </span>
        )}
      </header>
      <ul className="beam-scroll max-h-96 divide-y divide-border/60 overflow-y-auto">
        {rows.map((row) => (
          <TransferRowItem key={row.id} row={row} />
        ))}
      </ul>
    </section>
  )
}

export function TransferRowItem({ row }: { row: TransferRow }) {
  const cancelTransfer = useBeamStore((s) => s.cancelTransfer)
  const retryTransfer = useBeamStore((s) => s.retryTransfer)

  const pct = row.size > 0 ? Math.min(100, (row.transferred / row.size) * 100) : 0
  const isUpload = row.direction === 'p2d'
  const done = row.status === 'done'
  const active = row.status === 'active'

  return (
    <li className="px-4 py-3 animate-row-in">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            isUpload ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-primary/10 text-primary',
          )}
          title={isUpload ? 'Phone → Desktop' : 'Desktop → Phone'}
        >
          {isUpload ? <ArrowUpFromLine className="h-4 w-4" aria-hidden /> : <ArrowDownToLine className="h-4 w-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium" title={row.name}>
              <FileTypeIcon type={row.type} name={row.name} className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{row.name}</span>
            </p>
            <span className="tnum shrink-0 text-xs text-muted-foreground">
              {done ? formatBytes(row.size) : `${formatBytes(row.transferred)} / ${formatBytes(row.size)}`}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className={cn('flex-1', active && 'progress-shine rounded-full')}>
              <Progress value={pct} className="h-1.5" aria-label={`Transfer progress ${pct.toFixed(0)}%`} />
            </div>
            <span className="tnum w-10 shrink-0 text-right text-xs font-medium">{pct.toFixed(0)}%</span>
            {active && <SpeedSparkline active={active} speed={row.speed} className="h-5 w-16 shrink-0" />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              {isUpload ? 'Phone → Desktop' : 'Desktop → Phone'}
            </span>
            {row.transport && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{row.transport === 'webrtc' ? 'P2P' : 'Relay'}</span>
            )}
            {active && (
              <>
                <span className="tnum">{formatSpeed(row.speed)}</span>
                {row.etaSec !== null && <span className="tnum">{formatDuration(row.etaSec)} left</span>}
              </>
            )}
            {row.status === 'queued' && <span>Queued…</span>}
            {done && (
              <span className="inline-flex items-center gap-1 font-medium text-primary">
                <Check className="h-3 w-3" aria-hidden /> Completed
              </span>
            )}
            {row.status === 'canceled' && <span>Canceled</span>}
            {row.status === 'error' && (
              <span className="inline-flex items-center gap-1 text-destructive">
                <CircleAlert className="h-3 w-3" aria-hidden /> {row.error ?? 'Failed'}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {active && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => cancelTransfer(row.id)}
              aria-label={`Cancel transfer of ${row.name}`}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          {(row.status === 'error' || row.status === 'canceled') && (
            <Button variant="outline" size="sm" className="h-8" onClick={() => retryTransfer(row.id)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Retry
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Received files (from phone)                                        */
/* ------------------------------------------------------------------ */

export function ReceivedFiles() {
  const received = useBeamStore((s) => s.received)
  const saveReceived = useBeamStore((s) => s.saveReceived)
  const dismissReceived = useBeamStore((s) => s.dismissReceived)

  if (received.length === 0) return null

  return (
    <section aria-label="Received files" className="rounded-2xl border border-primary/30 bg-primary/5 shadow-sm animate-fade-up">
      <header className="flex items-center justify-between border-b border-primary/20 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ArrowUpFromLine className="h-4 w-4 text-primary" aria-hidden />
          Incoming files
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{received.length}</span>
        </h2>
      </header>
      <ul className="beam-scroll max-h-72 divide-y divide-primary/10 overflow-y-auto">
        {received.map((file) => (
          <li key={file.id} className="animate-row-in flex items-center gap-3 px-4 py-3 transition-colors hover:bg-primary/5">
            {file.type.startsWith('image/') ? (
              <img
                src={file.url}
                alt={`Preview of ${file.name}`}
                className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
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
              <p className="tnum text-xs text-muted-foreground">
                {formatBytes(file.size)} · {formatRelativeTime(file.receivedAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {file.type.startsWith('image/') && (
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <a href={file.url} target="_blank" rel="noreferrer" aria-label={`Preview ${file.name}`}>
                    <Eye className="h-4 w-4" />
                  </a>
                </Button>
              )}
              <Button variant="secondary" size="sm" className="h-8" onClick={() => saveReceived(file.id)}>
                <Download className="h-4 w-4" aria-hidden />
                Download
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => {
                  saveReceived(file.id)
                  notifyOpenFolderHint()
                }}
                aria-label={`Save ${file.name} and show folder hint`}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => dismissReceived(file.id)}
                aria-label={`Dismiss ${file.name}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function notifyOpenFolderHint() {
  import('sonner').then(({ toast }) => {
    toast.info('Saved to your downloads folder', {
      description: 'Browsers can’t open local folders — check your browser’s downloads (Ctrl/⌘+J).',
    })
  })
}

export function TransfersSpinner() {
  return <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
}
