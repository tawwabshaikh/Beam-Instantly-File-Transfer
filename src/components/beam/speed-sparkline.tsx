'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Inline SVG sparkline of recent transfer speeds.
 * Samples the live speed every 150ms while the transfer is active.
 * Only mounted for active rows, so no reset bookkeeping is needed.
 */
export function SpeedSparkline({
  active,
  speed,
  className,
}: {
  active: boolean
  speed: number
  className?: string
}) {
  const [series, setSeries] = useState<number[]>([])
  const speedRef = useRef(speed)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    if (!active) return
    const iv = setInterval(() => {
      setSeries((prev) => {
        const next = [...prev, speedRef.current]
        return next.length > 24 ? next.slice(-24) : next
      })
    }, 150)
    return () => clearInterval(iv)
  }, [active])

  const w = 64
  const h = 20
  const pts = series.slice(-24)
  const max = Math.max(...pts, 1)
  const step = pts.length > 1 ? w / (pts.length - 1) : w
  const points = pts
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`)
    .join(' ')

  if (!active) return null

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn('text-primary/70', className)}
    >
      {points && (
        <>
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polygon
            points={`0,${h} ${points} ${((pts.length - 1) * step).toFixed(1)},${h}`}
            fill="currentColor"
            opacity="0.12"
            stroke="none"
          />
        </>
      )}
    </svg>
  )
}
