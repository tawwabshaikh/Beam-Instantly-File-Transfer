'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaState {
  prompt: BeforeInstallPromptEvent | null
  standalone: boolean
}

const SERVER_STATE: PwaState = { prompt: null, standalone: false }

/* Module-level external store — identity changes only on real updates. */
let state: PwaState = SERVER_STATE
const subscribers = new Set<() => void>()

function setState(next: Partial<PwaState>): void {
  state = { ...state, ...next }
  for (const fn of subscribers) fn()
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

function getSnapshot(): PwaState {
  return state
}

function getServerSnapshot(): PwaState {
  return SERVER_STATE
}

/**
 * "Install Beam" button — appears when the browser fires `beforeinstallprompt`
 * (Chromium: the app passes PWA criteria and isn't already installed).
 * Safari iOS doesn't fire the event; the About page covers manual install steps.
 */
export function InstallPwaButton({ className }: { className?: string }) {
  const { prompt, standalone } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    setState({ standalone: window.matchMedia('(display-mode: standalone)').matches })
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setState({ prompt: e as BeforeInstallPromptEvent })
    }
    const onInstalled = () => setState({ standalone: true, prompt: null })
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (standalone || !prompt) return null

  return (
    <Button
      variant="ghost"
      size="sm"
      className={'h-9 gap-1.5 text-xs font-medium text-primary hover:text-primary ' + (className ?? '')}
      onClick={() => {
        void prompt.prompt()
        setState({ prompt: null })
      }}
      aria-label="Install Beam as an app"
    >
      <Download className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Install</span>
    </Button>
  )
}
