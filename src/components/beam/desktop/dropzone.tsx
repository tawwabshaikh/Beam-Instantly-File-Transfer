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
  GripVertical,
} from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  const reorderFiles = useBeamStore((s) => s.reorderSelectedFiles)
  const phase = useBeamStore((s) => s.phase)
  const [dragging, setDragging] = useState(false)
  const [dragActiveId, setDragActiveId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const addFiles = useBeamStore((s) => s.addFiles)

  const total = files.reduce((a, f) => a + f.size, 0)
  const locked = phase === 'connected' || phase === 'connecting'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

  const onDragStart = useCallback((e: DragStartEvent) => {
    setDragActiveId(String(e.active.id))
  }, [])

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setDragActiveId(null)
      const { active, over } = e
      if (over && active.id !== over.id) reorderFiles(String(active.id), String(over.id))
    },
    [reorderFiles],
  )

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
          <p className="tnum text-xs text-muted-foreground">
            {formatBytes(total)} total
            {!locked && files.length > 1 && ' · drag to reorder'}
          </p>
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          modifiers={[verticalOnly]}
        >
          <SortableContext items={files.map((f) => f.id)} strategy={verticalListSortingStrategy} disabled={locked}>
            <ul className="divide-y divide-border/60 px-2 py-1">
              {files.map((f, i) => (
                <SortableFileRow
                  key={f.id}
                  file={f}
                  index={i + 1}
                  onRemove={() => removeFile(f.id)}
                  disabled={locked}
                  dragging={dragActiveId === f.id}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </ScrollArea>
      {locked && (
        <p className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
          File picker is locked while a device is paired — you can still{' '}
          <span className="font-medium text-foreground">drag &amp; drop files here</span> and the phone sees them instantly.
        </p>
      )}
    </section>
  )
}

function SortableFileRow({
  file,
  index,
  onRemove,
  disabled,
  dragging,
}: {
  file: SelectedFile
  index: number
  onRemove: () => void
  disabled?: boolean
  dragging: boolean
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isSorting } = useSortable({
    id: file.id,
    disabled,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative flex items-center gap-1.5 rounded-xl px-2 py-2.5 transition-colors',
        dragging && 'z-10 bg-card shadow-lg shadow-black/10 ring-1 ring-primary/40',
        isSorting && !dragging && 'bg-accent/40',
      )}
      aria-label={`Position ${index}: ${file.name}`}
    >
      {!disabled && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
          aria-label={`Reorder ${file.name}. Press space and arrow keys to move.`}
          tabIndex={0}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      )}
      <span className="tnum hidden w-5 shrink-0 text-center text-[11px] font-medium text-muted-foreground/70 sm:block">
        {index}
      </span>
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
