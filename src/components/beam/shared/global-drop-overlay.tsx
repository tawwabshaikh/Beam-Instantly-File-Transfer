'use client'

import { useEffect, useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { useBeamStore } from '@/lib/beam/engine'

/**
 * Full-screen "Drop to add files" overlay. Users can drop anywhere on the
 * page — not just precisely on the dropzone card. Only reacts to file drags
 * (text/link drags are ignored). The actual `drop` is handled once here;
 * per-card handlers stop propagation to avoid double-adding.
 */
export function GlobalDropOverlay({ onDropped }: { onDropped?: () => void }) {
  const addFiles = useBeamStore((s) => s.addFiles)
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current++
      setDragging(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    // Cards handle their own drops (and stop propagation) — they announce it
    // so the overlay never stays stuck if a drop sneaks in before it paints.
    const onDropHandled = () => {
      depth.current = 0
      setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      if (e.dataTransfer?.files?.length) {
        addFiles(e.dataTransfer.files)
        onDropped?.()
      }
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('beam:drop-complete', onDropHandled)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('beam:drop-complete', onDropHandled)
    }
  }, [addFiles, onDropped])

  if (!dragging) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-background/60 p-6 backdrop-blur-sm"
      role="presentation"
      data-beam-drop-overlay
    >
      <div className="pointer-events-none flex h-full w-full max-w-2xl flex-col items-center justify-center rounded-3xl border-2 border-dashed border-primary bg-primary/5 shadow-[0_0_0_8px_--theme(--color-primary/8%),0_24px_80px_-24px_--theme(--color-primary/40%)] animate-fade-up">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <UploadCloud className="h-8 w-8 animate-bounce" aria-hidden />
        </span>
        <p className="mt-5 text-lg font-semibold">Drop to add files</p>
        <p className="mt-1 text-sm text-muted-foreground">
          They’ll be ready for the paired device to download
        </p>
      </div>
    </div>
  )
}
