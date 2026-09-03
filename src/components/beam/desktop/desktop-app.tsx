'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, RotateCcw, CheckCircle2, Clock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SiteHeader, type DesktopNavView } from '@/components/beam/site-header'
import { SiteFooter } from '@/components/beam/site-footer'
import { LandingSections } from '@/components/beam/desktop/landing'
import { DropzoneCard, FilesCard } from '@/components/beam/desktop/dropzone'
import { QrCard } from '@/components/beam/desktop/qr-card'
import { SessionDashboard, TransfersList, ReceivedFiles } from '@/components/beam/desktop/session-panel'
import { HistoryView } from '@/components/beam/desktop/history-view'
import { AboutView } from '@/components/beam/desktop/about-view'
import { useBeamStore } from '@/lib/beam/engine'
import { formatCountdown } from '@/lib/beam/format'
import { useCountdown } from '@/hooks/use-countdown'

export function DesktopApp() {
  const [view, setView] = useState<DesktopNavView>('transfer')

  // Tear down sockets/peers when leaving the page
  useEffect(() => {
    return () => useBeamStore.getState().resetAll()
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader view={view} onNavigate={setView} />
      <main className="flex-1">
        {view === 'transfer' && <TransferView />}
        {view === 'history' && <HistoryView />}
        {view === 'about' && <AboutView />}
      </main>
      <SiteFooter />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Transfer view — the main workspace                                 */
/* ------------------------------------------------------------------ */

function TransferView() {
  const phase = useBeamStore((s) => s.phase)
  const hasFiles = useBeamStore((s) => s.selectedFiles.length > 0)

  const idle = phase === 'idle'
  const active = phase === 'creating' || phase === 'waiting' || phase === 'connecting' || phase === 'connected'

  return (
    <div>
      {idle && (
        <LandingSections
          onStart={() => document.getElementById('transfer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      )}

      <section id="transfer" className="mx-auto w-full max-w-5xl scroll-mt-16 px-4 py-10 sm:px-6 sm:py-14">
        {idle && <DropzoneCard />}

        {phase === 'creating' && <CreatingCard />}

        {active && hasFiles && <SessionArea />}

        {(phase === 'expired' || phase === 'ended' || phase === 'failed') && <TerminalState />}
      </section>
    </div>
  )
}

function CreatingCard() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center shadow-sm animate-fade-up">
      <span className="relative flex h-10 w-10 items-center justify-center">
        <span className="absolute inline-flex h-full w-full rounded-full bg-primary/30 animate-beam-ping" />
        <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        </span>
      </span>
      <p className="font-medium">Creating secure session…</p>
      <p className="text-sm text-muted-foreground">Generating a one-time QR pairing code</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Active session layout (waiting → connecting → connected)           */
/* ------------------------------------------------------------------ */

function SessionArea() {
  const phase = useBeamStore((s) => s.phase)

  if (phase === 'connected') {
    return (
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <SessionDashboard />
          <TransfersList />
          <ReceivedFiles />
          <FilesCard compact />
        </div>
        <div className="lg:col-span-2">
          <QrCard variant="compact" />
        </div>
      </div>
    )
  }

  // waiting / connecting
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <QrCard variant="full" />
      <div className="flex flex-col gap-6">
        <FilesCard compact />
        <CrossNetworkTip />
      </div>
    </div>
  )
}

function CrossNetworkTip() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-accent/50 p-4 text-sm">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Your phone doesn’t need the same Wi-Fi.</span>{' '}
        Mobile data, another network, another country — the QR link works anywhere the internet reaches.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Terminal states: expired / ended / failed                          */
/* ------------------------------------------------------------------ */

function TerminalState() {
  const phase = useBeamStore((s) => s.phase)
  const error = useBeamStore((s) => s.error)
  const session = useBeamStore((s) => s.session)
  const expiresAt = session?.expiresAt ?? 0
  const remaining = useCountdown(expiresAt)

  const createNewSession = useBeamStore((s) => s.createNewSession)
  const resetAll = useBeamStore((s) => s.resetAll)
  const keepFiles = useBeamStore((s) => s.selectedFiles.length > 0)

  const config =
    phase === 'expired'
      ? {
          icon: Clock,
          title: 'Session expired',
          body: 'For your security, sessions are destroyed 10 minutes after creation. Nothing was kept.',
          tone: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-500/10 border-amber-500/30',
        }
      : phase === 'ended'
        ? {
            icon: CheckCircle2,
            title: 'Session ended',
            body: 'This transfer session was closed. Start a new one whenever you’re ready.',
            tone: 'text-primary',
            bg: 'bg-primary/5 border-primary/30',
          }
        : {
            icon: AlertTriangle,
            title: error?.title ?? 'Something went wrong',
            body: error?.message ?? 'An unexpected error occurred. Please try again.',
            tone: 'text-destructive',
            bg: 'bg-destructive/5 border-destructive/30',
          }

  const Icon = config.icon

  return (
    <div className={`mx-auto max-w-lg animate-fade-up rounded-2xl border ${config.bg} p-8 text-center shadow-sm`}>
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-background ${config.tone}`}>
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">{config.title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{config.body}</p>
      {phase === 'expired' && remaining > 0 && (
        <p className="tnum mt-2 text-xs text-muted-foreground">Expired {formatCountdown(remaining)} ago</p>
      )}
      <div className="mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
        {keepFiles ? (
          <Button onClick={() => void createNewSession()} className="min-w-40">
            <RotateCcw className="h-4 w-4" aria-hidden />
            Create New Session
          </Button>
        ) : (
          <Button onClick={resetAll} className="min-w-40">
            <Plus className="h-4 w-4" aria-hidden />
            Start New Transfer
          </Button>
        )}
        <Button variant="ghost" onClick={resetAll}>
          Start over
        </Button>
      </div>
    </div>
  )
}
