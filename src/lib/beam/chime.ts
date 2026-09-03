'use client'

/**
 * Tiny WebAudio feedback chime — created lazily on the first user gesture
 * (so autoplay policies keep it usable) and played on transfer completion.
 * Volume is intentionally very low; failures are silent no-ops.
 */

let ctx: AudioContext | null = null
let primed = false

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    return ctx
  } catch {
    return null
  }
}

/** Prime the AudioContext on any user gesture so later chimes can play. */
export function primeChime(): void {
  if (primed) return
  const c = ensureContext()
  if (!c) return
  primed = true
  // Resume inside a gesture handler
  void c.resume().catch(() => undefined)
  if (typeof document !== 'undefined') {
    document.removeEventListener('pointerdown', primeChime)
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', primeChime, { once: false, passive: true })
}

function tone(freq: number, startAt: number, duration: number, volume: number): void {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, ctx.currentTime + startAt)
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startAt + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime + startAt)
  osc.stop(ctx.currentTime + startAt + duration + 0.05)
}

/** Pleasant two-note "done" chime. */
export function playChime(): void {
  const c = ensureContext()
  if (!c || c.state !== 'running') return
  try {
    tone(880, 0, 0.18, 0.06)
    tone(1318.5, 0.12, 0.22, 0.05)
  } catch {
    // audio is best-effort
  }
}
