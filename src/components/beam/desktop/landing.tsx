'use client'

import {
  ArrowRight,
  FileArchive,
  FileImage,
  FileText,
  FileUp,
  FileVideo2,
  Globe2,
  Lock,
  MoveRight,
  Package,
  QrCode,
  ScanLine,
  Smartphone,
  Wifi,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SESSION_TTL_MINUTES } from '@/lib/beam/config'
import { useLang } from '@/lib/beam/i18n'

export function LandingSections({ onStart }: { onStart: () => void }) {
  return (
    <>
      <Hero onStart={onStart} />
      <HowItWorks />
      <CrossNetworkBand />
      <Features />
    </>
  )
}

function Hero({ onStart }: { onStart: () => void }) {
  const { t } = useLang()
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
      <FloatingChips />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-4 pt-16 text-center sm:px-6 sm:pt-24">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
          <Lock className="h-3.5 w-3.5 text-primary" aria-hidden />
          {t('hero.badge')}
        </span>
        <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
          {t('hero.title')}{' '}
          <span className="hero-shimmer">{t('hero.shimmer')}</span>
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          {t('hero.sub')}{' '}
          <span className="whitespace-nowrap">{t('hero.subEm')}</span>
        </p>
        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Button
            size="lg"
            className="group h-12 min-w-48 px-7 text-base font-medium shadow-md active:scale-[0.98]"
            onClick={onStart}
          >
            {t('hero.cta')}
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 min-w-40 px-7 text-base active:scale-[0.98]"
            onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {t('hero.how')}
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">{t('hero.fine')}</p>
      </div>
    </section>
  )
}

/** Decorative file chips drifting around the hero headline (desktop only). */
const CHIPS = [
  { icon: FileImage, label: 'beach-sunset.jpg', className: 'left-[6%] top-[24%] -rotate-6', duration: '7s', delay: '0s' },
  { icon: FileVideo2, label: 'trip-highlight.mp4', className: 'right-[7%] top-[30%] rotate-3', duration: '8.5s', delay: '0.8s' },
  { icon: FileText, label: 'notes.pdf', className: 'left-[13%] bottom-[8%] rotate-2', duration: '9s', delay: '1.6s' },
  { icon: FileArchive, label: 'project.zip', className: 'right-[13%] bottom-[4%] -rotate-3', duration: '7.8s', delay: '0.4s' },
]

function FloatingChips() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      {CHIPS.map((chip) => (
        <span
          key={chip.label}
          className={`absolute flex items-center gap-2 rounded-xl border border-border/80 bg-card/90 px-3 py-2 text-xs font-medium text-muted-foreground shadow-md shadow-black/5 backdrop-blur-sm beam-float ${chip.className}`}
          style={{ animationDuration: chip.duration, animationDelay: chip.delay }}
        >
          <chip.icon className="h-3.5 w-3.5 text-primary" />
          {chip.label}
        </span>
      ))}
    </div>
  )
}

function useSteps() {
  const { t } = useLang()
  return [
    { icon: FileUp, step: '1', title: t('steps.s1.title'), body: t('steps.s1.body') },
    { icon: ScanLine, step: '2', title: t('steps.s2.title'), body: t('steps.s2.body') },
    { icon: Smartphone, step: '3', title: t('steps.s3.title'), body: t('steps.s3.body') },
  ]
}

function HowItWorks() {
  const { t } = useLang()
  const steps = useSteps()
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-5xl scroll-mt-16 px-4 py-14 sm:px-6 sm:py-20">
      <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">{t('steps.title')}</h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted-foreground sm:text-base">
        {t('steps.sub')}
      </p>
      <ol className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-6">
        {steps.map((s, i) => (
          <li
            key={s.step}
            className="group relative rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
          >
            {i < steps.length - 1 && (
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

/* ------------------------------------------------------------------ */
/* Cross-network band — animated route: Wi-Fi ⇄ Internet ⇄ Mobile data */
/* ------------------------------------------------------------------ */

function CrossNetworkBand() {
  const { t } = useLang()
  return (
    <section
      aria-labelledby="cross-network-title"
      className="mx-auto w-full max-w-5xl px-4 pb-4 sm:px-6"
    >
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-10 shadow-sm sm:px-10">
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_50%_110%,--theme(--color-primary/7%),transparent)]"
        />
        <div className="relative">
          <h2 id="cross-network-title" className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('band.title')}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-sm text-muted-foreground sm:text-base">
            {t('band.sub')}
          </p>
          <div className="mt-9 flex items-center justify-center gap-2.5 sm:gap-4">
            <BandNode icon={Wifi} label={t('band.a')} />
            <BandConnector />
            <BandNode icon={Globe2} label={t('band.b')} center />
            <BandConnector reverse />
            <BandNode icon={Smartphone} label={t('band.c')} />
          </div>
        </div>
      </div>
    </section>
  )
}

function BandNode({
  icon: Icon,
  label,
  center = false,
}: {
  icon: typeof Wifi
  label: string
  center?: boolean
}) {
  return (
    <div className="flex w-16 flex-col items-center gap-2 sm:w-20">
      <span
        className={
          center
            ? 'flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/10'
            : 'flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background text-foreground/80 shadow-sm'
        }
      >
        <Icon className={center ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden />
      </span>
      <span className="text-center text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  )
}

/** Dashed wire with a packet dot flying across it (direction-aware). */
function BandConnector({ reverse = false }: { reverse?: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative block h-px w-10 shrink-0 overflow-visible bg-border sm:w-24 ${reverse ? 'beam-wire-reverse' : 'beam-wire'}`}
    >
      <span
        className={`beam-packet absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_2px] shadow-primary/40 ${reverse ? 'beam-packet-reverse' : ''}`}
      />
    </span>
  )
}

function useFeatures() {
  const { t } = useLang()
  return [
    { icon: Zap, title: t('features.f1.title'), body: t('features.f1.body') },
    { icon: Smartphone, title: t('features.f2.title'), body: t('features.f2.body') },
    { icon: QrCode, title: t('features.f3.title'), body: t('features.f3.body') },
    { icon: Globe2, title: t('features.f4.title'), body: t('features.f4.body') },
    { icon: Lock, title: t('features.f5.title'), body: t('features.f5.body', { ttl: SESSION_TTL_MINUTES }) },
    { icon: Package, title: t('features.f6.title'), body: t('features.f6.body') },
  ]
}

function Features() {
  const { t } = useLang()
  const features = useFeatures()
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6 sm:pb-24">
      <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
        {t('features.title')}
      </h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
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
