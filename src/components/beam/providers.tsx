'use client'

import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import { toast } from 'sonner'
import { consumeSharedTextFromUrl } from '@/lib/beam/share-target'
import { initDocumentLang } from '@/lib/beam/i18n'

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

  // Web Share Target: text shared into Beam from the OS share sheet lands
  // as ?title/&text/&url params — stash it and clean the address bar.
  useEffect(() => {
    consumeSharedTextFromUrl()
  }, [])

  // i18n: apply the persisted language to <html lang> once on boot.
  useEffect(() => {
    initDocumentLang()
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
