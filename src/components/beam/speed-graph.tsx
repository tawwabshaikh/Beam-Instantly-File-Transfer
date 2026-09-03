'use client'

import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { useBeamStore } from '@/lib/beam/engine'
import { formatSpeed } from '@/lib/beam/format'
import { cn } from '@/lib/utils'

const SAMPLE_MS = 300
const WINDOW = 90 // ~27 s of rolling activity
const W = 320
const H = 72

/**
 * Live aggregate throughput graph for the connected dashboard, split by
 * direction (emerald = desktop→phone, purple = phone→desktop).
 *
 * Deliberately NOT subscribed to the transfers map — it reads the store from
 * its own sample timer, so high-frequency progress writes never re-render
 * the dashboard tree through this component. Sampling pauses while the tab
 * is hidden (battery saver, same policy as the row sparklines).
 */
export function TransferSpeedGraph({ className }: { className?: string }) {
  const [down, setDown] = useState<number[]>([])
  const [up, setUp] = useState<number[]>([])
  const downRef = useRef<number[]>([])
  const upRef = useRef<number[]>([])
  const peakRef = useRef(0)
  const [peak, setPeak] = useState(0)

  useEffect(() => {
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      let d = 0
      let u = 0
      for (const r of Object.values(useBeamStore.getState().transfers)) {
        if (r.status !== 'active') continue
        if (r.direction === 'd2p') d += r.speed
        else u += r.speed
      }
      downRef.current = pushSample(downRef.current, d)
      upRef.current = pushSample(upRef.current, u)
      setDown(downRef.current)
      setUp(upRef.current)
      const now = Math.max(d, u)
      if (now > peakRef.current) {
        peakRef.current = now
        setPeak(now)
      }
    }, SAMPLE_MS)
    return () => clearInterval(iv)
  }, [])

  const latestDown = down.length > 0 ? down[down.length - 1] : 0
  const latestUp = up.length > 0 ? up[up.length - 1] : 0
  const max = Math.max(...down, ...up, 1024)
  const downPath = buildPath(down, max)
  const upPath = buildPath(up, max)
  const idle = peak === 0

  return (
    <div
      data-testid="speed-graph"
      className={cn('rounded-xl border border-border/70 bg-background/50 p-3', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Activity className="h-3.5 w-3.5 text-primary" aria-hidden />
          Transfer activity
          <span className="text-[10px] font-normal text-muted-foreground/70">· last ~25 s</span>
        </p>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="tnum inline-flex items-center gap-1 font-medium text-primary">
            <ArrowDownToLine className="h-3 w-3" aria-hidden />
            {formatSpeed(latestDown)}
          </span>
          <span className="tnum inline-flex items-center gap-1 font-medium text-purple-600 dark:text-purple-400">
            <ArrowUpFromLine className="h-3 w-3" aria-hidden />
            {formatSpeed(latestUp)}
          </span>
          {peak > 0 && (
            <span className="tnum hidden text-muted-foreground sm:inline">peak {formatSpeed(peak)}</span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden
        className="mt-2 h-16 w-full text-primary"
      >
        <defs>
          <linearGradient id="beam-speed-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={H * f}
            y2={H * f}
            className="stroke-border/60"
            strokeWidth="1"
            strokeDasharray="3 5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* baseline */}
        <line x1="0" x2={W} y1={H - 1} y2={H - 1} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />

        {/* upload series (purple, outline) */}
        {upPath && (
          <path
            d={upPath.line}
            fill="none"
            className="stroke-purple-500 dark:stroke-purple-400"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* download series (primary, filled) */}
        {downPath && (
          <>
            <path d={downPath.area} fill="url(#beam-speed-fill)" stroke="none" />
            <path
              d={downPath.line}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {idle && (
          <text
            x={W / 2}
            y={H / 2 + 3}
            textAnchor="middle"
            className="fill-muted-foreground/50"
            fontSize="9"
          >
            waiting for transfer activity…
          </text>
        )}
      </svg>
    </div>
  )
}

function pushSample(arr: number[], v: number): number[] {
  const next = [...arr, v]
  return next.length > WINDOW ? next.slice(-WINDOW) : next
}

function buildPath(series: number[], max: number): { line: string; area: string } | null {
  if (series.length === 0) return null
  const n = series.length
  const step = n > 1 ? W / (n - 1) : W
  const pts = series.map((v, i) => {
    const x = i * step
    const y = H - (v / max) * (H - 8) - 3
    return [x, Math.max(2, Math.min(H - 2, y))] as const
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const lastX = pts[pts.length - 1][0].toFixed(1)
  const area = `${line} L${lastX},${H} L0,${H} Z`
  return { line, area }
}
