'use client'

/**
 * Bundle received files into a single ZIP download (store/deflate via fflate).
 * Intentionally capped: everything is zipped in memory, so huge batches fall
 * back to the per-file download path.
 */

import { zipSync, type Zippable } from 'fflate'

export const ZIP_MAX_TOTAL_BYTES = 200 * 1024 * 1024 // 200 MB safety cap

export function canZip(files: { size: number }[]): boolean {
  return files.length > 0 && files.reduce((a, f) => a + f.size, 0) <= ZIP_MAX_TOTAL_BYTES
}

/** Unique keys — fflate rejects duplicate entry names. */
function uniqueNames(names: string[]): Map<number, string> {
  const used = new Set<string>()
  const out = new Map<number, string>()
  names.forEach((name, i) => {
    if (!used.has(name)) {
      used.add(name)
      out.set(i, name)
      return
    }
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    for (let n = 1; n < 100; n++) {
      const candidate = `${stem} (${n})${ext}`
      if (!used.has(candidate)) {
        used.add(candidate)
        out.set(i, candidate)
        return
      }
    }
  })
  return out
}

export function zipFileName(): string {
  const d = new Date()
  const pad = (x: number) => String(x).padStart(2, '0')
  return `beam-files-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.zip`
}

/**
 * Fetch every blob URL, zip, and trigger a browser download.
 * Throws if any entry fails to fetch.
 */
export async function zipAndDownload(entries: { name: string; url: string }[]): Promise<void> {
  const names = uniqueNames(entries.map((e) => e.name))
  const bundle: Zippable = {}
  await Promise.all(
    entries.map(async (entry, i) => {
      const res = await fetch(entry.url)
      if (!res.ok) throw new Error(`Could not read ${entry.name}`)
      bundle[names.get(i) ?? entry.name] = new Uint8Array(await res.arrayBuffer())
    }),
  )
  const zipped = zipSync(bundle, { level: 0 }) // files are often compressed already; level 0 is fast
  const blob = new Blob([zipped], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = zipFileName()
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 20_000)
}
