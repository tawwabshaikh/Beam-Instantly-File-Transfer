import { BLOCKED_EXTENSIONS, LIMITS } from './protocol'

/** File selection validation — enforces security + size policy. */

export interface FileRejection {
  name: string
  reason: string
}

export interface FileValidation {
  accepted: File[]
  rejections: FileRejection[]
  totalBytes: number
}

export function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function getExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : ''
}

export function isBlockedType(name: string): boolean {
  return BLOCKED_EXTENSIONS.includes(getExtension(name))
}

export function validateFiles(
  files: File[],
  existingTotal = 0,
): FileValidation {
  const accepted: File[] = []
  const rejections: FileRejection[] = []
  let totalBytes = existingTotal

  for (const file of files) {
    if (accepted.length + rejections.length + accepted.length >= LIMITS.MAX_FILES) {
      rejections.push({ name: file.name, reason: `Maximum ${LIMITS.MAX_FILES} files per session` })
      continue
    }
    if (isBlockedType(file.name)) {
      rejections.push({
        name: file.name,
        reason: 'Executable files can’t be transferred for security reasons',
      })
      continue
    }
    if (file.size > LIMITS.MAX_FILE_BYTES) {
      rejections.push({ name: file.name, reason: 'File exceeds the 2 GB per-file limit' })
      continue
    }
    if (file.size === 0) {
      rejections.push({ name: file.name, reason: 'Empty files cannot be transferred' })
      continue
    }
    if (totalBytes + file.size > LIMITS.MAX_TOTAL_BYTES) {
      rejections.push({ name: file.name, reason: 'Session total size limit of 4 GB exceeded' })
      continue
    }
    accepted.push(file)
    totalBytes += file.size
  }

  return { accepted, rejections, totalBytes }
}

/** Small image previews for the file list. */
export function makePreviewUrl(file: File): string | null {
  if (file.type.startsWith('image/') && file.size < 15 * 1024 * 1024) {
    try {
      return URL.createObjectURL(file)
    } catch {
      return null
    }
  }
  return null
}
