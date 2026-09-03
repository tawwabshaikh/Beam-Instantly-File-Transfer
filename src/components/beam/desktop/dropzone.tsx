'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  File as FileIcon,
  FileArchive,
  FileText,
  Film,
  FolderPlus,
  Image as ImageIcon,
  Music,
  Paperclip,
  UploadCloud,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBeamStore, type SelectedFile } from '@/lib/beam/engine'
import { formatBytes } from '@/lib/beam/format'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* File type icon                                                     */
/* ------------------------------------------------------------------ */

export function FileTypeIcon({
  type,
  name,
  className,
}: {
  type: string
  name?: string
  className?: string
}) {
  const ext = name?.split('.').pop()?.toLowerCase() ?? ''
  const cls = cn('h-4 w-4', className)
  if (type.startsWith('image/')) return <ImageIcon className={cn(cls, 'text-sky-600 dark:text-sky-400')} aria-hidden />
  if (type.startsWith('video/')) return <Film className={cn(cls, 'text-purple-600 dark:text-purple-400')} aria-hidden />
  if (type.startsWith('audio/')) return <Music className={cn(cls, 'text-pink-600 dark:text-pink-400')} aria-hidden />
  if (type === 'application/pdf' || ext === 'pdf') return <FileText className={cn(cls, 'text-red-600 dark:text-red-400')} aria-hidden />
  if (
    type.includes('zip') ||
    type.includes('compressed') ||
    type.includes('tar') ||
    ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)
  ) {
    return <FileArchive className={cn(cls, 'text-amber-600 dark:text-amber-400')} aria-hidden />
  }
  if (type.startsWith('text/') || ['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) {
    return <FileText className={cn(cls, 'text-emerald-600 dark:text-emerald-400')} aria-hidden />
  }
  return <FileIcon className={cn(cls, 'text-muted-foreground')} aria-hidden />
}

/* ------------------------------------------------------------------ */
/* Dropzone (empty state)                                             */
/* ------------------------------------------------------------------ */

export function DropzoneCard() {
  const addFiles = useBeamStore((s) => s.addFiles)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const onPick = useCallback(
    (files: FileList | null) => {
      if (files && files.length > 0) addFiles(files)
    },
    [addFiles],
  )

  // Paste files straight from the clipboard (screenshots!)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length > 0) {
        e.preventDefault()
        addFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload files: drag and drop or press Enter to browse"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepth.current++
        setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault()
        dragDepth.current--
        if (dragDepth.current <= 0) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        onPick(e.dataTransfer.files)
      }}
      className={cn(
        'group relative flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring',
        dragging
          ? 'scale-[1.01] border-primary bg-primary/5 shadow-[0_0_0_6px_--theme(--color-primary/10%),0_12px_40px_-12px_--theme(--color-primary/35%)]'
          : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          onPick(e.target.files)
          e.target.value = ''
        }}
      />
      <span
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300',
          dragging
            ? 'scale-110 bg-primary text-primary-foreground shadow-lg shadow-primary/30'
            : 'bg-primary/10 text-primary group-hover:scale-105',
        )}
      >
        <UploadCloud className={cn('h-8 w-8 transition-transform', dragging && 'animate-bounce')} aria-hidden />
      </span>
      <p className="mt-5 text-lg font-medium">Drop files here</p>
      <p className="mt-1 text-sm text-muted-foreground">
        or <span className="font-medium text-primary underline-offset-2 group-hover:underline">browse your computer</span> — paste works too (⌘/Ctrl+V)
      </p>
      <Button tabIndex={-1} variant="secondary" className="mt-6 pointer-events-none">
        <Paperclip className="h-4 w-4" aria-hidden />
        Select Files
      </Button>
      <p className="mt-5 text-xs text-muted-foreground">
        Images · Videos · PDFs · Documents · ZIP · Up to 2 GB per file, 20 files per session
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Selected files card (compact = inside active session)              */
/* ------------------------------------------------------------------ */

export function FilesCard({ compact = false }: { compact?: boolean }) {
  const files = useBeamStore((s) => s.selectedFiles)
  const removeFile = useBeamStore((s) => s.removeSelectedFile)
  const phase = useBeamStore((s) => s.phase)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const addFiles = useBeamStore((s) => s.addFiles)

  const total = files.reduce((a, f) => a + f.size, 0)
  const locked = phase === 'connected' || phase === 'connecting'

  if (files.length === 0) return null

  return (
    <section
      aria-label="Selected files"
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepth.current++
        setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current--
        if (dragDepth.current <= 0) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
      }}
      className={cn(
        'rounded-2xl border bg-card shadow-sm transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-border',
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">
            {files.length} {files.length === 1 ? 'file' : 'files'} ready
          </h2>
          <p className="tnum text-xs text-muted-foreground">{formatBytes(total)} total</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => inputRef.current?.click()}
          disabled={locked}
        >
          <FolderPlus className="h-4 w-4" aria-hidden />
          Add more
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </header>
      <ScrollArea className={cn('beam-scroll', files.length > 4 ? 'h-64' : 'max-h-64')} type="always">
        <ul className="divide-y divide-border/60 px-2 py-1">
          {files.map((f) => (
            <FileRow key={f.id} file={f} onRemove={() => removeFile(f.id)} disabled={locked} />
          ))}
        </ul>
      </ScrollArea>
      {locked && (
        <p className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
          Files are locked while a device is connected.
        </p>
      )}
    </section>
  )
}

function FileRow({
  file,
  onRemove,
  disabled,
}: {
  file: SelectedFile
  onRemove: () => void
  disabled?: boolean
}) {
  return (
    <li className="flex items-center gap-3 px-2 py-2.5">
      {file.previewUrl ? (
        <img
          src={file.previewUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
          loading="lazy"
        />
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
          {formatBytes(file.size)}
          {file.type ? ` · ${file.type}` : ''}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${file.name}`}
      >
        <X className="h-4 w-4" />
      </Button>
    </li>
  )
}
