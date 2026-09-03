'use client'

import { useEffect, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CircleAlert,
  Download,
  Eye,
  FileArchive,
  FileAudio,
  FileOutput,
  Files,
  FolderOpen,
  Gauge,
  HardDrive,
  Loader2,
  Maximize2,
  Pencil,
  RotateCcw,
  Send,
  Timer,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { useBeamStore, type ReceivedFile, type TransferRow } from '@/lib/beam/engine'
import { formatBytes, formatDuration, formatRelativeTime, formatSpeed } from '@/lib/beam/format'
import { describeDevice } from '@/lib/beam/device'
import { extendWindowFor } from '@/lib/beam/protocol'
import { supportsSaveToFolder } from '@/lib/beam/save-target'
import { canZip, zipAndDownload } from '@/lib/beam/zip'
import { FileTypeIcon } from '@/components/beam/desktop/dropzone'
import { SpeedSparkline } from '@/components/beam/speed-sparkline'
import { TransferSpeedGraph } from '@/components/beam/speed-graph'
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
    <section
      aria-label="Active session"
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm animate-fade-up"
    >
      {/* subtle emerald wash behind the header — decorative only */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/[0.06] to-transparent" />
      <div className="relative flex items-start justify-between gap-4">
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

      <div className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary animate-beam-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        Connected{mode === 'relay' ? ' · secure relay' : ' · peer-to-peer'}
      </div>

      <dl className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Files} label="Files transferred" value={String(stats.filesTransferred)} tone="bg-primary/10 text-primary" />
        <StatCard icon={HardDrive} label="Total data" value={formatBytes(stats.totalData)} tone="bg-teal-500/10 text-teal-600 dark:text-teal-400" />
        <StatCard icon={Gauge} label="Current speed" value={activeSpeed > 0 ? formatSpeed(activeSpeed) : '—'} tone="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
        <StatCard icon={Timer} label="Session time" value={formatDuration(elapsed)} tone="bg-zinc-500/10 text-zinc-500 dark:text-zinc-400" />
      </dl>

      <TransferSpeedGraph className="mt-4" />
    </section>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/50 p-3 transition-colors duration-200 hover:border-primary/30 hover:bg-primary/5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn('flex h-4.5 w-4.5 items-center justify-center rounded', tone)}>
          <Icon className="h-3 w-3" aria-hidden />
        </span>
        {label}
      </dt>
      <dd className="tnum mt-1 text-lg font-semibold leading-tight">{value}</dd>
    </div>
  )
}

/**
 * Host-only: resets the session countdown back to a full TTL.
 * The service accepts extends only within a scaled extend window,
 * so the control is hidden/disabled outside that window.
 */
export function ExtendButton({ expiresAt, className }: { expiresAt: number; className?: string }) {
  const remaining = useCountdown(expiresAt)
  const extendSession = useBeamStore((s) => s.extendSession)
  const ttlMinutes = useBeamStore((s) => s.ttlMinutes)
  const windowMs = extendWindowFor(ttlMinutes * 60_000)
  const canExtend = expiresAt > 0 && remaining > 0 && remaining <= windowMs
  const windowHint =
    windowMs >= 60_000
      ? `the last ${Math.round(windowMs / 60_000)} minute${windowMs >= 120_000 ? 's' : ''}`
      : `the last ${Math.max(5, Math.round(windowMs / 1000))} seconds`

  if (!expiresAt) return null
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('h-8', className)}
      onClick={extendSession}
      disabled={!canExtend}
      title={canExtend ? `Reset the session countdown to a fresh ${ttlMinutes} minutes` : `Available during ${windowHint}`}
    >
      <Timer className="h-4 w-4 text-primary" aria-hidden />
      Extend +{ttlMinutes} min
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
      <section className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(5,150,105,0.05),transparent_60%)]" />
        <span className="relative mx-auto flex h-14 w-14 items-center justify-center">
          <span aria-hidden className="absolute inset-0 rounded-full border border-dashed border-primary/30 animate-[spin_14s_linear_infinite]" />
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Files className="h-4.5 w-4.5" />
          </span>
        </span>
        <p className="relative mt-4 text-sm font-medium">No transfers yet</p>
        <p className="relative mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
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
    <li className="px-4 py-3 animate-row-in transition-colors hover:bg-accent/30">
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
  const chooseSaveFolder = useBeamStore((s) => s.chooseSaveFolder)
  const clearSaveFolder = useBeamStore((s) => s.clearSaveFolder)
  const saveFolder = useBeamStore((s) => s.saveFolder)
  const [previewFile, setPreviewFile] = useState<ReceivedFile | null>(null)
  const [zipping, setZipping] = useState(false)

  if (received.length === 0) return null

  const totalBytes = received.reduce((a, f) => a + f.size, 0)
  const folderCapable = supportsSaveToFolder()
  const zipEligible = received.length >= 2 && canZip(received)

  const handleZip = () => {
    if (zipping) return
    setZipping(true)
    void zipAndDownload(received.map((f) => ({ name: f.name, url: f.url })))
      .then(() => notifyZipDone())
      .catch(() => notifyZipFail())
      .finally(() => setZipping(false))
  }

  return (
    <section aria-label="Received files" className="rounded-2xl border border-primary/30 bg-primary/5 shadow-sm animate-fade-up">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ArrowUpFromLine className="h-4 w-4 text-primary" aria-hidden />
          Incoming files
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{received.length}</span>
          <span className="tnum text-xs font-normal text-muted-foreground">· {formatBytes(totalBytes)}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {zipEligible && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 border-primary/30 bg-background/60"
              onClick={handleZip}
              disabled={zipping}
              title={`Bundle all ${received.length} files into one ZIP download`}
            >
              {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileArchive className="h-3.5 w-3.5 text-primary" aria-hidden />}
              {zipping ? 'Zipping…' : 'Download all (.zip)'}
            </Button>
          )}
          {folderCapable && !saveFolder && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 border-primary/30 bg-background/60"
              onClick={() => void chooseSaveFolder()}
              title="Pick a folder once — every received file is written there automatically from then on"
            >
              <FolderOpen className="h-3.5 w-3.5 text-primary" aria-hidden />
              Save to folder…
            </Button>
          )}
          {saveFolder && (
            <span className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-primary/30 bg-background/60 px-2.5 py-1 text-xs">
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span className="truncate font-medium" title={`Saving into “${saveFolder}”`}>
                {saveFolder}
              </span>
              <button
                type="button"
                onClick={clearSaveFolder}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={`Stop saving into ${saveFolder}`}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          )}
        </div>
      </header>
      <ul className="beam-scroll max-h-72 divide-y divide-primary/10 overflow-y-auto">
        {received.map((file) => (
          <li
            key={file.id}
            draggable
            onDragStart={(e) => handleReceivedDragStart(file, e)}
            title="Drag this row out to your desktop or a folder to save it there"
            className="group/row animate-row-in flex cursor-grab items-center gap-3 px-4 py-3 transition-colors hover:bg-primary/5 active:cursor-grabbing"
          >
            {file.type.startsWith('image/') ? (
              <button
                type="button"
                onClick={() => setPreviewFile(file)}
                className="group/thumb relative shrink-0 overflow-hidden rounded-lg border border-border"
                aria-label={`Open preview of ${file.name}`}
              >
                <img
                  src={file.url}
                  alt={`Preview of ${file.name}`}
                  className="h-10 w-10 object-cover transition-transform duration-200 group-hover/thumb:scale-110"
                  loading="lazy"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover/thumb:opacity-100">
                  <Maximize2 className="h-3.5 w-3.5 text-white" aria-hidden />
                </span>
              </button>
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
              {previewKind(file) && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewFile(file)} aria-label={`Preview ${file.name}`}>
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              <Button variant="secondary" size="sm" className="h-8" onClick={() => saveReceived(file.id)}>
                <Download className="h-4 w-4" aria-hidden />
                {saveFolder ? 'Save' : 'Download'}
              </Button>
              <span
                aria-hidden
                title="Drag this row out to save it anywhere"
                className="hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground/40 transition-all group-hover/row:text-primary md:flex"
              >
                <FileOutput className="h-4 w-4" />
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground opacity-100 transition-opacity md:opacity-0 md:group-focus-within/row:opacity-100 md:group-hover/row:opacity-100"
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
                className="h-8 w-8 text-muted-foreground opacity-100 transition-opacity md:opacity-0 md:group-focus-within/row:opacity-100 md:group-hover/row:opacity-100"
                onClick={() => dismissReceived(file.id)}
                aria-label={`Dismiss ${file.name}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <FilePreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} onDownload={() => previewFile && saveReceived(previewFile.id)} />
    </section>
  )
}

function notifyZipDone() {
  import('sonner').then(({ toast }) => toast.success('ZIP downloaded', { description: 'All received files bundled into one archive.' }))
}
function notifyZipFail() {
  import('sonner').then(({ toast }) => toast.error('Could not build the ZIP', { description: 'Download the files individually instead.' }))
}

/** Which inline preview the dialog can render for a file (null = none). */
export function previewKind(file: ReceivedFile): 'image' | 'video' | 'audio' | 'pdf' | 'text' | null {
  const t = file.type
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('audio/')) return 'audio'
  if (t === 'application/pdf') return 'pdf'
  if (t.startsWith('text/') || /json|xml|javascript|csv|markdown|yaml/.test(t)) return 'text'
  return null
}

/**
 * Drag-out: native OS drag of a received file straight into Finder/Explorer,
 * another app, or the desktop. Works in Chromium via the DownloadURL data
 * type (blob: URLs are resolved by the drop target); other browsers still
 * get uri-list/text fallbacks. The payload is mirrored to window.__beam
 * for QA verification.
 */
function handleReceivedDragStart(file: ReceivedFile, e: React.DragEvent) {
  const mime = file.type || 'application/octet-stream'
  const payload = `${mime}:${file.name}:${file.url}`
  try {
    e.dataTransfer.setData('DownloadURL', payload)
  } catch {
    /* some engines reject unknown types — fallbacks below still apply */
  }
  try {
    e.dataTransfer.setData('text/uri-list', file.url)
    e.dataTransfer.setData('text/plain', file.name)
  } catch {
    /* ignore */
  }
  e.dataTransfer.effectAllowed = 'copy'
  const w = window as unknown as { __beam?: Record<string, unknown> }
  if (w.__beam) {
    w.__beam.lastDragOut = {
      name: file.name,
      size: file.size,
      type: file.type,
      url: file.url,
      payload,
      at: Date.now(),
    }
  }
}

/** Full preview dialog — images, video, audio, PDF, and text files. */
function FilePreviewDialog({
  file,
  onClose,
  onDownload,
}: {
  file: ReceivedFile | null
  onClose: () => void
  onDownload: () => void
}) {
  const [textState, setTextState] = useState<{ id: string; body: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const kind = file ? previewKind(file) : null
  const phase = useBeamStore((s) => s.phase)

  // Editable: small text files while the session is live (sends back to the phone)
  const editable = kind === 'text' && file !== null && file.size <= 100 * 1024 && phase === 'connected'

  // Switching files always leaves edit mode
  useEffect(() => {
    setEditing(false)
  }, [file?.id])

  useEffect(() => {
    if (!file || kind !== 'text') return
    let alive = true
    void fetch(file.url)
      .then((r) => r.blob())
      .then((b) => b.slice(0, 100 * 1024)) // first 100 KB is plenty for a glance
      .then((slice) => slice.text())
      .then((body) => {
        if (alive) setTextState({ id: file.id, body })
      })
      .catch(() => {
        if (alive) setTextState({ id: file.id, body: '// Preview unavailable' })
      })
    return () => {
      alive = false
    }
  }, [file, kind])

  const textBody = file && kind === 'text' && textState && textState.id === file.id ? textState.body : null

  const startEditing = () => {
    if (textBody === null) return
    setDraft(textBody)
    setEditing(true)
  }

  const sendEditedBack = () => {
    if (!file) return
    const ext = file.name.match(/\.[^./]+$/)?.[0] ?? '.txt'
    const base = file.name.replace(/\.[^./]+$/, '')
    const edited = new File([draft], `${base} (edited)${ext}`, {
      type: file.type || 'text/plain',
    })
    useBeamStore.getState().addFiles([edited])
    setEditing(false)
    onClose()
    import('sonner').then(({ toast }) =>
      toast.success('Edited copy sent back', {
        description: `“${edited.name}” is now in the session — the phone can download it from “From desktop”.`,
      }),
    )
  }

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {file && (
          <>
            <DialogTitle className="sr-only">Preview of {file.name}</DialogTitle>
            <div className="flex max-h-[65vh] items-center justify-center overflow-hidden bg-zinc-950">
              {editing && kind === 'text' ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  aria-label={`Edit ${file.name} before sending it back`}
                  className="beam-scroll h-[65vh] w-full animate-fade-up resize-none bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200 outline-none"
                />
              ) : (
              <>
              {kind === 'image' && (
                <img
                  src={file.url}
                  alt={`Full preview of ${file.name}`}
                  className="max-h-[65vh] w-auto max-w-full animate-fade-up object-contain"
                />
              )}
              {kind === 'video' && (
                <video
                  src={file.url}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[65vh] w-full animate-fade-up bg-black"
                />
              )}
              {kind === 'audio' && (
                <div className="flex w-full flex-col items-center gap-4 bg-gradient-to-b from-zinc-900 to-zinc-950 px-6 py-10 animate-fade-up">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <FileAudio className="h-8 w-8" aria-hidden />
                  </span>
                  <p className="max-w-full truncate text-sm font-medium text-white/90">{file.name}</p>
                  <audio src={file.url} controls autoPlay className="w-full max-w-sm" />
                </div>
              )}
              {kind === 'pdf' && (
                <iframe
                  src={file.url}
                  title={`PDF preview of ${file.name}`}
                  className="h-[65vh] w-full animate-fade-up bg-white"
                />
              )}
              {kind === 'text' && (
                <pre className="beam-scroll max-h-[65vh] w-full animate-fade-up overflow-auto bg-zinc-950 p-4 text-left font-mono text-xs leading-relaxed text-zinc-200">
                  {textBody ?? 'Loading preview…'}
                </pre>
              )}
              {kind === null && (
                <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
                  <FileTypeIcon type={file.type} name={file.name} className="h-8 w-8 text-zinc-400" />
                  <p className="text-sm text-zinc-400">No inline preview for this file type — save it to open locally.</p>
                </div>
              )}
              </>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="tnum text-xs text-muted-foreground">{formatBytes(file.size)} · {file.type}</p>
              </div>
              {editing && kind === 'text' ? (
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={sendEditedBack} disabled={draft === textBody}>
                    <Send className="h-4 w-4" aria-hidden />
                    Send to phone
                  </Button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  {editable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={startEditing}
                      disabled={textBody === null}
                      title="Tweak the text here and push the edited copy back to the phone"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                      Edit & send back
                    </Button>
                  )}
                  <Button size="sm" onClick={onDownload}>
                    <Download className="h-4 w-4" aria-hidden />
                    Save
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
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
