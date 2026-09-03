'use client'

import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import { toast } from 'sonner'

/**
 * App-wide providers: dark/light theme + bridge that turns engine-level
 * notifications (CustomEvents) into toasts + PWA service-worker registration.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        type: 'success' | 'error' | 'info'
        title: string
        description?: string
      }
      if (!detail?.title) return
      if (detail.type === 'success') toast.success(detail.title, { description: detail.description })
      else if (detail.type === 'error') toast.error(detail.title, { description: detail.description })
      else toast.info(detail.title, { description: detail.description })
    }
    window.addEventListener('beam:notify', handler)
    return () => window.removeEventListener('beam:notify', handler)
  }, [])

  // PWA: register the (network-only, cache-free) service worker so the
  // browser can offer "Install Beam". Registration is best-effort.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const t = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }, 1200)
    return () => clearTimeout(t)
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  )
}
