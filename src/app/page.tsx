'use client'

import { Suspense, useSyncExternalStore } from 'react'
import { useSearchParams } from 'next/navigation'
import { DesktopApp } from '@/components/beam/desktop/desktop-app'
import { MobileSession } from '@/components/beam/mobile/mobile-session'
import { getDeviceInfo } from '@/lib/beam/device'

const subscribeToNothing = () => () => {}

/**
 * Beam is a single-route app:
 *  - `/?s=CODE&t=TOKEN`  → phone/desktop joined via QR or pairing code
 *  - anything else        → desktop experience (Transfer / History / About)
 */
export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-hidden />}>
      <PageInner />
    </Suspense>
  )
}

function PageInner() {
  const params = useSearchParams()
  const isMobile = useSyncExternalStore(subscribeToNothing, () => getDeviceInfo().isMobile, () => false)
  const s = params.get('s')
  const t = params.get('t')

  const validPairing =
    !!s && /^[A-HJ-NP-Z2-9]{6}$/i.test(s) && (!t || (t.length >= 8 && t.length <= 128))

  return validPairing ? (
    <MobileSession code={s!.toUpperCase()} token={t ?? ''} desktop={!isMobile} />
  ) : (
    <DesktopApp />
  )
}
