'use client'

import { useCallback, useEffect, useState } from 'react'
import { isSoundMuted, setSoundMuted } from '@/lib/beam/chime'

/**
 * Reactive view of Beam's persisted sound preference.
 * Starts `false` on the server/first render (no hydration mismatch),
 * then syncs from localStorage + cross-tab storage events.
 */
export function useSoundMuted(): { muted: boolean; toggle: () => void } {
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const sync = () => setMuted(isSoundMuted())
    sync()
    window.addEventListener('beam:mute-change', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('beam:mute-change', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const toggle = useCallback(() => {
    setSoundMuted(!isSoundMuted())
  }, [])

  return { muted, toggle }
}
