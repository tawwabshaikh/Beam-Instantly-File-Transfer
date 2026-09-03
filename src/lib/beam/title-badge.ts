'use client'

/**
 * Background-tab attention badge. When a file or note arrives while the tab
 * is hidden, the document title gets a "(N)" counter so the user notices in
 * the tab strip; it resets the moment the tab becomes visible again.
 */

let baseTitle: string | null = null
let hiddenCount = 0
let installed = false

function ensureListeners(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  baseTitle = document.title
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      hiddenCount = 0
      if (baseTitle) document.title = baseTitle
    }
  })
}

/** Call once per incoming item (file received / note arrived). */
export function bumpTitleBadge(): void {
  ensureListeners()
  if (typeof document === 'undefined') return
  if (document.visibilityState !== 'hidden') return
  hiddenCount++
  if (baseTitle) document.title = `(${hiddenCount}) ${baseTitle}`
}
