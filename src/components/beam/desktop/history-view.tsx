'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Download,
  Inbox,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { clearHistory, downloadHistoryCsv, loadHistory, type HistoryEntry } from '@/lib/beam/history'
import { formatBytes, formatRelativeTime } from '@/lib/beam/format'
import { useLang } from '@/lib/beam/i18n'
import { FileTypeIcon } from '@/components/beam/desktop/dropzone'
import { cn } from '@/lib/utils'

type DirectionFilter = 'all' | 'd2p' | 'p2d'
type StatusFilter = 'all' | 'completed' | 'failed'

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
  const { t } = useLang()
  const entries = useSyncExternalStore(subscribeHistory, getHistorySnapshot, getServerSnapshot)
  const [query, setQuery] = useState('')
  const [direction, setDirection] = useState<DirectionFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      if (direction !== 'all' && e.direction !== direction) return false
      if (status === 'completed' && e.status !== 'completed') return false
      if (status === 'failed' && e.status !== 'failed') return false
      if (q && !e.name.toLowerCase().includes(q) && !(e.sessionCode ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [entries, query, direction, status])

  const completed = entries.filter((e) => e.status === 'completed').length
  const totalBytes = entries.reduce((a, e) => a + e.size, 0)
  const filtersActive = query.trim() !== '' || direction !== 'all' || status !== 'all'

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('hist.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('hist.sub')}
          </p>
        </div>
        {entries.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadHistoryCsv(entries)}
              aria-label={t('hist.exportCsvAria', { n: entries.length })}
            >
              <Download className="h-4 w-4" aria-hidden />
              {t('hist.exportCsv')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => clearHistory()}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t('hist.clear')}
            </Button>
          </div>
        )}
      </header>

      {entries.length > 0 && (
        <>
          <dl className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <dt className="text-xs font-medium text-muted-foreground">{t('hist.stat.transfers')}</dt>
              <dd className="tnum mt-0.5 text-lg font-semibold">
                {completed}
                {completed !== entries.length && (
                  <span className="text-sm font-normal text-muted-foreground"> / {entries.length}</span>
                )}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <dt className="text-xs font-medium text-muted-foreground">{t('hist.stat.data')}</dt>
              <dd className="tnum mt-0.5 text-lg font-semibold">{formatBytes(totalBytes)}</dd>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <dt className="text-xs font-medium text-muted-foreground">{t('hist.stat.success')}</dt>
              <dd className="tnum mt-0.5 text-lg font-semibold">
                {entries.length === 0 ? '—' : `${Math.round((completed / entries.length) * 100)}%`}
              </dd>
            </div>
          </dl>

          {/* Filters + search */}
          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('hist.search.placeholder')}
                aria-label={t('hist.search.aria')}
                className="h-9 bg-background pl-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('hist.search.clear')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <FilterGroup
                icon={ArrowDownLeft}
                label={t('hist.filter.direction')}
                ariaLabel={t('hist.aria.byDirection')}
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 'all', label: t('hist.filter.all') },
                  { value: 'd2p', label: t('hist.filter.toPhone') },
                  { value: 'p2d', label: t('hist.filter.toDesktop') },
                ]}
              />
              <FilterGroup
                icon={SlidersHorizontal}
                label={t('hist.filter.status')}
                ariaLabel={t('hist.aria.byStatus')}
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: t('hist.filter.all') },
                  { value: 'completed', label: t('hist.filter.done') },
                  { value: 'failed', label: t('hist.filter.failed') },
                ]}
              />
            </div>
          </div>
        </>
      )}

      {entries.length === 0 ? (
        <EmptyHistory />
      ) : filtered.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Search className="h-5 w-5 text-muted-foreground" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-medium">{t('hist.noMatch.title')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('hist.noMatch.sub')}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 h-8"
            onClick={() => {
              setQuery('')
              setDirection('all')
              setStatus('all')
            }}
          >
            {t('hist.reset')}
          </Button>
        </div>
      ) : (
        <>
          {filtersActive && (
            <p className="tnum mt-5 text-xs text-muted-foreground" aria-live="polite">
              {t('hist.showing', { shown: filtered.length, total: entries.length })}
            </p>
          )}
          <ScrollArea className="beam-scroll mt-3 max-h-[52vh] pr-3" type="always">
            <ul className="space-y-2.5">
              {filtered.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </ScrollArea>
        </>
      )}
    </div>
  )
}

function FilterGroup<T extends string>({
  icon: Icon,
  label,
  ariaLabel,
  value,
  onChange,
  options,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>
  label: string
  ariaLabel: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={ariaLabel}>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
      <div className="flex rounded-lg border border-border bg-background p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              value === opt.value
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const { t } = useLang()
  return (
    <li
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
          {entry.sessionCode ? ` · ${t('hist.session', { code: entry.sessionCode })}` : ''}
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
          {entry.direction === 'd2p' ? t('hist.dir.d2p') : t('hist.dir.p2d')}
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
          {entry.status === 'completed' ? t('hist.status.completed') : t('hist.status.failed')}
        </span>
      </div>
    </li>
  )
}

function EmptyHistory() {
  const { t } = useLang()
  return (
    <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
      </span>
      <p className="mt-4 font-medium">{t('hist.empty.title')}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {t('hist.empty.sub')}
      </p>
    </div>
  )
}
