'use client'

import { useSyncExternalStore } from 'react'
import { ClipboardCopy, FilePlus2, ScanLine, Send, Share2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBeamStore } from '@/lib/beam/engine'
import { notify } from '@/lib/beam/engine'
import {
  SHARED_TEXT_EVENT,
  clearSharedText,
  composeSharedBody,
  getSharedText,
  sharedFileName,
  type SharedText,
} from '@/lib/beam/share-target'
import { cn } from '@/lib/utils'

function subscribeShared(onChange: () => void): () => void {
  window.addEventListener(SHARED_TEXT_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(SHARED_TEXT_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** Reactive read of the stashed share-target payload (stable references). */
export function useSharedText(): SharedText | null {
  return useSyncExternalStore(subscribeShared, getSharedText, () => null)
}

function makeSharedFile(shared: SharedText, body: string): File {
  return new File([body], sharedFileName(shared), { type: 'text/plain' })
}

/**
 * Banner shown when text arrived via the PWA share target. Two variants:
 * desktop (add as selectable file / copy) and mobile (send as note or file
 * once paired). Dismissing clears the stash everywhere.
 */
export function SharedTextBanner({ variant }: { variant: 'desktop' | 'mobile' }) {
  const shared = useSharedText()
  const phase = useBeamStore((s) => s.phase)
  if (!shared) return null

  const body = composeSharedBody(shared)
  const connected = phase === 'connected'
  const preview = body.length > 140 ? `${body.slice(0, 140)}…` : body

  const dismiss = () => clearSharedText()

  const copy = () => {
    void navigator.clipboard
      .writeText(body)
      .then(() => notify('success', 'Copied shared text', 'Ready to paste anywhere.'))
      .catch(() => notify('error', 'Could not copy', 'Select the text in the banner and copy manually.'))
  }

  const addToDesktop = () => {
    useBeamStore.getState().addFiles([makeSharedFile(shared, body)])
    clearSharedText()
    notify(
      'success',
      'Shared text added as a file',
      connected
        ? 'The phone can download it from “From desktop”.'
        : 'Create a session and the phone can download it after pairing.',
    )
  }

  const sendAsNote = () => {
    useBeamStore.getState().sendNote(body)
    clearSharedText()
    notify('success', 'Shared text sent as a note', undefined)
  }

  const sendAsFile = () => {
    useBeamStore.getState().addMobileFiles([makeSharedFile(shared, body)])
    clearSharedText()
    notify('success', 'Shared text sent to desktop', 'It arrives as a .txt file.')
  }

  return (
    <aside
      data-testid="shared-text-banner"
      aria-label="Text shared from another app"
      className={cn(
        'flex animate-fade-up items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm',
        variant === 'mobile' ? 'flex-col gap-3' : '',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Share2 className="h-4.5 w-4.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Shared from another app</p>
        <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted-foreground" title={body}>
          {preview}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {variant === 'desktop' ? (
            <>
              <Button size="sm" className="h-8" onClick={addToDesktop}>
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
                Add as file
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={copy}>
                <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
                Copy
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" className="h-8" onClick={sendAsNote} disabled={!connected}>
                <Send className="h-3.5 w-3.5" aria-hidden />
                Send as note
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={sendAsFile} disabled={!connected}>
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
                Send as .txt
              </Button>
              {!connected && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ScanLine className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Scan a desktop QR first — the text is kept safely here.
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Dismiss shared text"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </aside>
  )
}
