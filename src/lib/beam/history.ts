import type { TransferDirection } from './protocol'

/**
 * Privacy-conscious local transfer history.
 * Stored ONLY in this browser's localStorage — the server never keeps
 * transfer history, and files are never persisted anywhere.
 */

const KEY = 'beam.history.v1'
const MAX_ENTRIES = 200

export interface HistoryEntry {
  id: string
  name: string
  size: number
  direction: TransferDirection
  status: 'completed' | 'failed'
  createdAt: number
  sessionCode: string
}

export function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HistoryEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

export function recordHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): void {
  if (typeof window === 'undefined') return
  try {
    const entries = loadHistory()
    // Same-transfer guard: two tabs of one browser (or a rare engine double-fire)
    // can record the identical transfer within a moment — keep one entry.
    const last = entries[0]
    if (
      last &&
      last.name === entry.name &&
      last.size === entry.size &&
      last.direction === entry.direction &&
      last.status === entry.status &&
      last.sessionCode === entry.sessionCode &&
      Date.now() - last.createdAt < 3_000
    ) {
      return
    }
    const full: HistoryEntry = {
      ...entry,
      id: genId(),
      createdAt: Date.now(),
    }
    const next = [full, ...entries].slice(0, MAX_ENTRIES)
    window.localStorage.setItem(KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('beam:history-updated'))
  } catch {
    // storage full / disabled — history is best-effort
  }
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
    window.dispatchEvent(new CustomEvent('beam:history-updated'))
  } catch {
    // ignore
  }
}

/* CSV export (RFC 4180 quoting, BOM for Excel friendliness) */

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function historyToCsv(entries: HistoryEntry[]): string {
  const head = ['date', 'file', 'size_bytes', 'direction', 'status', 'session']
  const rows = entries.map((e) =>
    [
      new Date(e.createdAt).toISOString(),
      csvEscape(e.name),
      String(e.size),
      e.direction,
      e.status,
      e.sessionCode,
    ].join(','),
  )
  return '\uFEFF' + [head.join(','), ...rows].join('\r\n')
}

export function downloadHistoryCsv(entries: HistoryEntry[]): void {
  if (typeof window === 'undefined' || entries.length === 0) return
  const blob = new Blob([historyToCsv(entries)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `beam-transfer-history-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
