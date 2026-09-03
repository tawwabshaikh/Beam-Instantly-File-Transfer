'use client'

import { useEffect, useRef, useState } from 'react'
import { Hourglass, MessageSquareText, SendHorizonal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useBeamStore, type BeamNote } from '@/lib/beam/engine'
import { LIMITS } from '@/lib/beam/protocol'
import { formatClockTime } from '@/lib/beam/format'
import { cn } from '@/lib/utils'

/**
 * Chat-style short-text exchange between the paired devices.
 * Notes are relayed by the session service (never stored, never on disk)
 * and are independent of the file transport — they work over relay or P2P.
 */
export function NotesPanel({ variant }: { variant: 'desktop' | 'mobile' }) {
  const notes = useBeamStore((s) => s.notes)
  const role = useBeamStore((s) => s.role)
  const phase = useBeamStore((s) => s.phase)
  const sendNote = useBeamStore((s) => s.sendNote)

  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const connected = phase === 'connected'

  // Keep the newest note in view (only when already scrolled near the bottom).
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [notes])

  const submit = () => {
    if (!draft.trim() || !connected) return
    sendNote(draft)
    setDraft('')
  }

  const canSend = connected && draft.trim().length > 0

  return (
    <section
      aria-label="Notes"
      className={cn(
        'flex flex-col rounded-2xl border border-border bg-card shadow-sm animate-fade-up',
        variant === 'mobile' && 'shadow-none',
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquareText className="h-4 w-4 text-primary" aria-hidden />
          Notes
          {notes.length > 0 && (
            <span className="tnum rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {notes.length}
            </span>
          )}
        </h2>
        <span className="hidden text-[11px] text-muted-foreground sm:block">never stored · device to device</span>
      </header>

      {notes.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-muted-foreground">
          {connected ? (
            <>
              Send a link, a Wi-Fi password, a code snippet — it lands on the other device instantly.
            </>
          ) : (
            <>
              <Hourglass className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
              Text notes unlock once both devices are paired.
            </>
          )}
        </p>
      ) : (
        <div
          ref={listRef}
          className="beam-scroll max-h-56 space-y-2.5 overflow-y-auto px-4 py-3.5"
          role="log"
          aria-live="polite"
          aria-label="Notes conversation"
        >
          {notes.map((note) => (
            <NoteBubble key={note.id} note={note} mine={note.from === role} />
          ))}
        </div>
      )}

      <div className="border-t border-border/70 p-3">
        <div className="relative">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, LIMITS.MAX_NOTE_CHARS))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={connected ? 'Type a note… (Enter to send)' : 'Available once paired'}
            disabled={!connected}
            rows={variant === 'mobile' ? 2 : 2}
            className="min-h-[52px] resize-none pr-3 text-sm"
            aria-label="Note text"
          />
          {draft.length > 1000 && (
            <span className="tnum pointer-events-none absolute bottom-2 right-3 text-[10px] text-muted-foreground">
              {draft.length.toLocaleString()}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Shift+Enter for a new line
          </p>
          <Button size="sm" className="h-9 min-w-24" onClick={submit} disabled={!canSend}>
            <SendHorizonal className="h-4 w-4" aria-hidden />
            Send
          </Button>
        </div>
      </div>
    </section>
  )
}

function NoteBubble({ note, mine }: { note: BeamNote; mine: boolean }) {
  const copyNote = () => {
    void navigator.clipboard?.writeText(note.text).catch(() => undefined)
  }

  return (
    <div className={cn('flex flex-col animate-row-in', mine ? 'items-end' : 'items-start')}>
      <button
        type="button"
        onClick={copyNote}
        title="Click to copy"
        className={cn(
          'group max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-sm leading-relaxed transition-transform active:scale-[0.99]',
          mine
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md bg-muted text-foreground',
        )}
      >
        {note.text}
      </button>
      <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
        {mine ? 'You' : 'Other device'} · {formatClockTime(note.at)}
      </span>
    </div>
  )
}
