/**
 * Web Share Target handoff — text shared into Beam from the OS share sheet.
 *
 * The manifest declares a GET share_target ("/" with title/text/url params).
 * `consumeSharedTextFromUrl()` runs once on mount (Providers), stashes the
 * payload in sessionStorage and strips the share params from the URL so
 * reloads, QR navigations and session joins start clean. The banner picks it
 * up reactively and offers sending it as a note or a .txt file.
 */

export interface SharedText {
  title: string | null
  text: string | null
  url: string | null
  at: number
}

const KEY = 'beam.sharedText.v1'
export const SHARED_TEXT_EVENT = 'beam:shared-text-changed'

/** Cached snapshot so useSyncExternalStore gets stable references. */
let cache: SharedText | null = null

function sameShared(a: SharedText | null, b: SharedText | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.title === b.title && a.text === b.text && a.url === b.url && a.at === b.at
}

/**
 * One-shot: read share_target params from the current URL, stash them and
 * clean the address bar. Returns null when this is not a share handoff
 * (or when the URL carries pairing params, which must never be touched).
 */
export function consumeSharedTextFromUrl(): SharedText | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  if (params.has('s')) return null // pairing link — leave it alone
  const title = params.get('title')
  const text = params.get('text')
  const url = params.get('url')
  if (!title && !text && !url) return null

  const payload: SharedText = { title, text, url, at: Date.now() }
  stashSharedText(payload)

  params.delete('title')
  params.delete('text')
  params.delete('url')
  const qs = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
  return payload
}

export function stashSharedText(payload: SharedText): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    /* storage unavailable — banner simply won't persist */
  }
  cache = payload
  notifyChange()
}

export function getSharedText(): SharedText | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(KEY)
    const next = raw ? (JSON.parse(raw) as SharedText) : null
    if (!sameShared(cache, next)) cache = next
  } catch {
    if (cache !== null) cache = null
  }
  return cache
}

export function clearSharedText(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  if (cache !== null) {
    cache = null
    notifyChange()
  }
}

function notifyChange(): void {
  window.dispatchEvent(new CustomEvent(SHARED_TEXT_EVENT))
}

/** Body used for the note / file: title (if not already inside text) + text + URL. */
export function composeSharedBody(p: SharedText): string {
  const parts: string[] = []
  if (p.title && p.text && !p.text.includes(p.title)) parts.push(p.title)
  if (p.text) parts.push(p.text)
  if (p.url) parts.push(p.url)
  return parts.filter(Boolean).join('\n\n')
}

/** Filesystem-safe name derived from the shared content (e.g. "meeting-notes.txt"). */
export function sharedFileName(p: SharedText): string {
  const src = (p.title || p.text || 'shared text').trim().slice(0, 32)
  const safe =
    src
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'shared-text'
  return `${safe}.txt`
}
