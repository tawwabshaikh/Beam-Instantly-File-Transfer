'use client'

import { useEffect, useState } from 'react'

/**
 * Ticks once per second and returns the remaining ms until `expiresAt`.
 * Uses a "now" clock so no setState runs synchronously inside effects.
 */
export function useCountdown(expiresAt: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!expiresAt) return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [expiresAt])

  if (!expiresAt) return 0
  return Math.max(0, expiresAt - now)
}
