'use client'

import {
  ArrowRight,
  FileUp,
  Globe2,
  Lock,
  MoveRight,
  Package,
  QrCode,
  ScanLine,
  Smartphone,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export function LandingSections({ onStart }: { onStart: () => void }) {
  return (
    <>
      <Hero onStart={onStart} />
      <HowItWorks />
      <Features />
    </>
  )
}

function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden">
      {/* Soft radial accents + dot grid — restrained, monochrome-green */}
      <div
        aria-hidden
        className="dot-grid pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,--theme(--color-primary/8%),transparent)]"
      />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-4 pt-16 text-center sm:px-6 sm:pt-24">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
          <Lock className="h-3.5 w-3.5 text-primary" aria-hidden />
          Encrypted · Temporary sessions · No sign-up
        </span>
        <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
          Move files between devices.{' '}
          <span className="text-primary">Instantly.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          Scan once. Transfer securely. No cables. No apps.{' '}
          <span className="whitespace-nowrap">No shared Wi-Fi required.</span>
        </p>
        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Button size="lg" className="h-12 min-w-48 px-7 text-base font-medium shadow-md" onClick={onStart}>
            Start Transfer
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 min-w-40 px-7 text-base"
            onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            How it works
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Desktop ⇄ Phone · Works across different networks · Files never touch our servers
        </p>
      </div>
    </section>
  )
}

const STEPS = [
  {
    icon: FileUp,
    step: '1',
    title: 'Select',
    body: 'Choose a file on your desktop — drag, drop, or paste. Images, videos, PDFs, archives, anything.',
  },
  {
    icon: ScanLine,
    step: '2',
    title: 'Scan',
    body: 'Point your phone’s camera at the QR code. Your browser opens instantly — no app install.',
  },
  {
    icon: Smartphone,
    step: '3',
    title: 'Transfer',
    body: 'Download files to your phone, or send files back to the desktop. Both directions, one session.',
  },
]

function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-5xl scroll-mt-16 px-4 py-14 sm:px-6 sm:py-20">
      <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Three steps. That’s it.</h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted-foreground sm:text-base">
        From file pick-up to transfer in under ten seconds.
      </p>
      <ol className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-6">
        {STEPS.map((s, i) => (
          <li
            key={s.step}
            className="group relative rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
          >
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className="absolute top-1/2 -right-6 z-10 hidden -translate-y-1/2 sm:block"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background shadow-sm">
                  <MoveRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                </span>
              </span>
            )}
            <div className="flex items-center justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <s.icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-4xl font-semibold text-border transition-colors group-hover:text-primary/30" aria-hidden>
                {s.step}
              </span>
            </div>
            <h3 className="mt-4 font-semibold">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

const FEATURES = [
  {
    icon: Zap,
    title: 'Fast transfers',
    body: 'Direct device-to-device channels when possible — the file takes the shortest path.',
  },
  {
    icon: Smartphone,
    title: 'Phone ⇄ Desktop',
    body: 'Send in both directions. Photos from your phone land on the desktop in one tap.',
  },
  {
    icon: QrCode,
    title: 'QR pairing',
    body: 'Your phone camera is the scanner. Every session gets a unique, one-time code.',
  },
  {
    icon: Globe2,
    title: 'Any network',
    body: 'Wi-Fi on one side, 5G on the other? Different countries? It still just works.',
  },
  {
    icon: Lock,
    title: 'Secure by design',
    body: 'Cryptographic pairing tokens, 10-minute expiry, encryption in transit, zero storage.',
  },
  {
    icon: Package,
    title: 'Large files',
    body: 'Chunked streaming keeps memory flat — videos and archives up to 2 GB each.',
  },
]

function Features() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6 sm:pb-24">
      <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
        Built for real-world transfers
      </h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-105">
              <f.icon className="h-4.5 w-4.5" aria-hidden />
            </span>
            <h3 className="mt-3 font-medium">{f.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
