'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { DesktopApp } from '@/components/beam/desktop/desktop-app'
import { MobileSession } from '@/components/beam/mobile/mobile-session'

/**
 * Beam is a single-route app:
 *  - `/?s=CODE&t=TOKEN`  → phone (joined via QR scan / manual pairing key)
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
  const s = params.get('s')
  const t = params.get('t')

  const validPairing =
    !!s && !!t && /^[A-HJ-NP-Z2-9]{6}$/i.test(s) && t.length >= 8 && t.length <= 128

  return validPairing ? (
    <MobileSession code={s!.toUpperCase()} token={t!} />
  ) : (
    <DesktopApp />
  )
}
