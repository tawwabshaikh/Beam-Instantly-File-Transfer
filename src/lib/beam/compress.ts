/**
 * Client-side photo optimization for phone → desktop uploads.
 *
 * Big camera photos (often 3–8 MB) are decoded, downscaled to a sane
 * long-edge and re-encoded as JPEG before they enter the transfer queue.
 * Files that don't benefit (already small, GIFs, non-images, decode
 * failures) pass through untouched — compression NEVER makes a file bigger.
 */

export interface CompressOptions {
  /** Longest allowed edge in px. Larger images are scaled down. */
  maxDim?: number
  /** JPEG encoder quality (0–1). */
  quality?: number
  /** Skip files smaller than this many bytes — they're already cheap to send. */
  minBytes?: number
}

export interface CompressedItem {
  file: File
  originalSize: number
  size: number
  compressed: boolean
}

export const COMPRESSION_PRESET: Required<CompressOptions> = {
  maxDim: 2016,
  quality: 0.85,
  minBytes: 150 * 1024,
}

/** Extensions rewritten to .jpg when we re-encode as JPEG. */
const REENCODABLE_EXT = /\.(png|webp|bmp|tiff?|heic|heif|avif)$/i

export function isCompressibleImage(file: File): boolean {
  const preset = COMPRESSION_PRESET
  return (
    file.type.startsWith('image/') &&
    file.type !== 'image/gif' && // animation would be destroyed
    file.type !== 'image/svg+xml' && // vector, already tiny
    file.size >= preset.minBytes
  )
}

function renameForJpeg(name: string): string {
  return REENCODABLE_EXT.test(name) ? name.replace(REENCODABLE_EXT, '.jpg') : name
}

interface LoadedBitmap {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

async function loadBitmap(file: File): Promise<LoadedBitmap> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }
  }
  // Fallback: HTMLImageElement decode
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image decode failed'))
      img.src = url
    })
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}

/** Compress a single file. Returns the original untouched when it isn't worth it. */
export async function compressImage(file: File, options: CompressOptions = {}): Promise<CompressedItem> {
  const preset = { ...COMPRESSION_PRESET, ...options }
  const passthrough: CompressedItem = { file, originalSize: file.size, size: file.size, compressed: false }
  if (!isCompressibleImage(file)) return passthrough

  let bitmap: LoadedBitmap | null = null
  try {
    bitmap = await loadBitmap(file)
    const scale = Math.min(1, preset.maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return passthrough
    // White backing keeps transparent PNGs readable once encoded as JPEG
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap.source, 0, 0, w, h)
    bitmap.release()
    bitmap = null

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', preset.quality))
    canvas.width = 0
    canvas.height = 0
    if (!blob || blob.size >= file.size) return passthrough

    const out = new File([blob], renameForJpeg(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
    return { file: out, originalSize: file.size, size: out.size, compressed: true }
  } catch {
    bitmap?.release()
    return passthrough
  }
}

/** Compress a batch, preserving order. Failures fall back to the original file. */
export async function compressImages(files: File[], options: CompressOptions = {}): Promise<CompressedItem[]> {
  return Promise.all(files.map((f) => compressImage(f, options)))
}
