'use client'

import { useSyncExternalStore } from 'react'
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, CircleAlert, Download, Inbox, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { clearHistory, downloadHistoryCsv, loadHistory, type HistoryEntry } from '@/lib/beam/history'
import { formatBytes, formatRelativeTime } from '@/lib/beam/format'
import { FileTypeIcon } from '@/components/beam/desktop/dropzone'

/* Snapshot cache — keeps referential stability for useSyncExternalStore */
const EMPTY: HistoryEntry[] = []
let cacheRaw: string | null = null
let cacheVal: HistoryEntry[] = EMPTY

function getHistorySnapshot(): HistoryEntry[] {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem('beam.history.v1')
  } catch {
    raw = null
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw
    cacheVal = loadHistory()
  }
  return cacheVal
}

function getServerSnapshot(): HistoryEntry[] {
  return EMPTY
}

function subscribeHistory(onChange: () => void): () => void {
  window.addEventListener('beam:history-updated', onChange)
  window.addEventListener('focus', onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener('beam:history-updated', onChange)
    window.removeEventListener('focus', onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function HistoryView() {
  const entries = useSyncExternalStore(subscribeHistory, getHistorySnapshot, getServerSnapshot)

  const completed = entries.filter((e) => e.status === 'completed').length
  const totalBytes = entries.reduce((a, e) => a + e.size, 0)

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transfer history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stored only in this browser — never on our servers. File contents are not kept.
          </p>
        </div>
        {entries.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadHistoryCsv(entries)}
              aria-label={`Export ${entries.length} history entries as CSV`}
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => clearHistory()}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Clear history
            </Button>
          </div>
        )}
      </header>

      {entries.length > 0 && (
        <dl className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <dt className="text-xs font-medium text-muted-foreground">Transfers</dt>
            <dd className="tnum mt-0.5 text-lg font-semibold">
              {completed}
              {completed !== entries.length && (
                <span className="text-sm font-normal text-muted-foreground"> / {entries.length}</span>
              )}
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <dt className="text-xs font-medium text-muted-foreground">Data moved</dt>
            <dd className="tnum mt-0.5 text-lg font-semibold">{formatBytes(totalBytes)}</dd>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <dt className="text-xs font-medium text-muted-foreground">Success rate</dt>
            <dd className="tnum mt-0.5 text-lg font-semibold">
              {entries.length === 0 ? '—' : `${Math.round((completed / entries.length) * 100)}%`}
            </dd>
          </div>
        </dl>
      )}

      {entries.length === 0 ? (
        <EmptyHistory />
      ) : (
        <ScrollArea className="beam-scroll mt-6 max-h-[55vh] pr-3" type="always">
          <ul className="space-y-2.5">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex animate-row-in items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-colors duration-150 hover:border-primary/30 hover:bg-accent/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FileTypeIcon type="" name={entry.name} className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={entry.name}>
                    {entry.name}
                  </p>
                  <p className="tnum text-xs text-muted-foreground">
                    {formatBytes(entry.size)} · {formatRelativeTime(entry.createdAt)}
                    {entry.sessionCode ? ` · session ${entry.sessionCode}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <Badge
                    variant="outline"
                    className={
                      entry.direction === 'd2p'
                        ? 'border-primary/40 bg-primary/5 text-primary'
                        : 'border-purple-500/40 bg-purple-500/5 text-purple-600 dark:text-purple-400'
                    }
                  >
                    {entry.direction === 'd2p' ? (
                      <ArrowDownLeft className="h-3 w-3" aria-hidden />
                    ) : (
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                    )}
                    {entry.direction === 'd2p' ? 'Desktop → Phone' : 'Phone → Desktop'}
                  </Badge>
                  <span
                    className={
                      entry.status === 'completed'
                        ? 'inline-flex items-center gap-1 text-xs font-medium text-primary'
                        : 'inline-flex items-center gap-1 text-xs font-medium text-destructive'
                    }
                  >
                    {entry.status === 'completed' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <CircleAlert className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {entry.status === 'completed' ? 'Completed' : 'Failed'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  )
}

function EmptyHistory() {
  return (
    <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
      </span>
      <p className="mt-4 font-medium">No transfers yet</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Completed transfers from this device will show up here — with direction, size, and status.
      </p>
    </div>
  )
}
