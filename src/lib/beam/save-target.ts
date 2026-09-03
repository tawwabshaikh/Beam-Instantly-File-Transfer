/**
 * Save-to-folder support via the File System Access API (Chromium).
 *
 * Lets the desktop write received files directly into a folder the user
 * picked once — instead of one browser download per file. The directory
 * handle lives in memory for the current page session only (never
 * persisted), so a reload simply clears the choice.
 */

/** Minimal structural types — the API is Chromium-only and not in TS DOM lib. */
interface BeamWritable {
  write(data: Blob | BufferSource): Promise<void>
  close(): Promise<void>
  abort?(): Promise<void>
}
interface BeamFileHandle {
  createWritable(options?: { keepExistingData?: boolean }): Promise<BeamWritable>
}
interface BeamDirectoryHandle {
  name: string
  getFileHandle(name: string, options?: { create?: boolean }): Promise<BeamFileHandle>
}
type BeamWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: string
  }) => Promise<BeamDirectoryHandle>
}

let dirHandle: BeamDirectoryHandle | null = null

export function supportsSaveToFolder(): boolean {
  return typeof window !== 'undefined' && typeof (window as BeamWindow).showDirectoryPicker === 'function'
}

/** Open the picker. Returns the folder name, or null when cancelled/unavailable. */
export async function pickSaveFolder(): Promise<string | null> {
  const picker = (window as BeamWindow).showDirectoryPicker
  if (typeof picker !== 'function') return null
  try {
    const handle = await picker({ id: 'beam-received', mode: 'readwrite', startIn: 'downloads' })
    dirHandle = handle
    return handle.name
  } catch {
    // user cancelled (AbortError) or the picker is blocked
    return null
  }
}

export function getSaveFolderName(): string | null {
  return dirHandle?.name ?? null
}

export function clearSaveFolder(): void {
  dirHandle = null
}

/** Avoid clobbering: "a.png" → "a (1).png" → "a (2).png" … */
async function uniqueFileHandle(name: string): Promise<BeamFileHandle> {
  if (!dirHandle) throw new Error('No folder selected')
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  try {
    return await dirHandle.getFileHandle(name, { create: true })
  } catch {
    // name already exists — fall through to numbered variants
  }
  for (let i = 1; i < 100; i++) {
    const candidate = `${stem} (${i})${ext}`
    try {
      return await dirHandle.getFileHandle(candidate, { create: true })
    } catch {
      continue
    }
  }
  throw new Error('Could not find a free file name')
}

/** Write a blob into the picked folder under `name`. */
export async function saveBlobToFolder(blob: Blob, name: string): Promise<void> {
  const handle = await uniqueFileHandle(name)
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
    await writable.close()
  } catch (err) {
    try {
      await writable.abort?.()
    } catch {
      /* already closed */
    }
    throw err
  }
}
