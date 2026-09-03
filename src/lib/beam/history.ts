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

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
