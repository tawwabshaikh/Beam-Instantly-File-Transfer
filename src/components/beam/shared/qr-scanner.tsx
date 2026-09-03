'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Loader2, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * In-app QR scanner. Lets a phone that already has Beam open join a desktop
 * session by scanning the desktop's QR code — no camera-app round trip.
 *
 * Uses the platform BarcodeDetector (Chromium/Android). Browsers without it
 * (Safari/Firefox) get a clear explanation plus the manual key entry path.
 */

interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

export function barcodeScanSupported(): boolean {
  if (typeof window === 'undefined') return false
  const ctor = (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector
  return typeof ctor === 'function'
}

/** Extract (code, token) from a scanned pairing URL or CODE-KEY string. */
export function parsePairingPayload(text: string): { code: string; token: string } | null {
  const value = text.trim()
  try {
    const url = new URL(value)
    const s = url.searchParams.get('s')
    const t = url.searchParams.get('t')
    if (s && t && /^[A-HJ-NP-Z2-9]{6}$/i.test(s) && t.length >= 8 && t.length <= 128) {
      return { code: s.toUpperCase(), token: t }
    }
  } catch {
    // not a URL — try the manual CODE-KEY form
  }
  const m = value.match(/^([A-HJ-NP-Z2-9]{6})-([A-Za-z0-9]{8,128})$/i)
  if (m) return { code: m[1].toUpperCase(), token: m[2] }
  return null
}

type ScanState = 'idle' | 'starting' | 'scanning' | 'denied' | 'unsupported' | 'error'

export function QrScannerDialog({
  open,
  onOpenChange,
  onResult,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onResult: (code: string, token: string) => void
}) {
  const [state, setState] = useState<ScanState>('idle')
  const [errorHint, setErrorHint] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resultRef = useRef(false)

  const stopCamera = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async () => {
    if (!barcodeScanSupported()) {
      setState('unsupported')
      return
    }
    setState('starting')
    setErrorHint(null)
    resultRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play().catch(() => undefined)

      const detectorCtor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
      if (typeof detectorCtor !== 'function') {
        setState('unsupported')
        return
      }
      const detector = new detectorCtor({ formats: ['qr_code'] })

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      timerRef.current = setInterval(() => {
        if (resultRef.current || !videoRef.current || videoRef.current.readyState < 2 || !ctx) return
        const v = videoRef.current
        // Sample a centred square — QRs are usually framed there.
        const side = Math.min(v.videoWidth, v.videoHeight)
        const sx = (v.videoWidth - side) / 2
        const sy = (v.videoHeight - side) / 2
        canvas.width = 320
        canvas.height = 320
        ctx.drawImage(v, sx, sy, side, side, 0, 0, 320, 320)
        void detector
          .detect(canvas)
          .then((bars) => {
            if (resultRef.current || bars.length === 0) return
            const parsed = parsePairingPayload(bars[0].rawValue)
            if (!parsed) return
            resultRef.current = true
            try {
              navigator.vibrate?.(60)
            } catch {
              /* not available */
            }
            stopCamera()
            onResult(parsed.code, parsed.token)
          })
          .catch(() => undefined)
      }, 280)

      setState('scanning')
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') setState('denied')
      else {
        setState('error')
        setErrorHint(err instanceof Error ? err.message : null)
      }
    }
  }, [onResult, stopCamera])

  useEffect(() => {
    if (!open) {
      stopCamera()
      return
    }
    // Defer camera start one tick — keeps setState out of the effect body.
    const t = setTimeout(() => void startCamera(), 0)
    return () => {
      clearTimeout(t)
      stopCamera()
    }
  }, [open, startCamera, stopCamera])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-0 sm:max-w-sm">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-primary" aria-hidden />
            Scan the desktop QR code
          </DialogTitle>
          <DialogDescription>
            Point the camera at the QR code shown on your computer.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square w-full overflow-hidden bg-zinc-950">
          {/* live preview — always rendered so the video element survives state flips */}
          <video
            ref={videoRef}
            className={state === 'scanning' ? 'h-full w-full object-cover' : 'hidden'}
            playsInline
            muted
            aria-label="Camera preview for QR scanning"
          />

          {state === 'scanning' && (
            <>
              {/* viewfinder frame */}
              <span aria-hidden className="pointer-events-none absolute inset-8 rounded-2xl border border-white/25" />
              <span aria-hidden className="pointer-events-none absolute left-8 top-8 h-8 w-8 rounded-tl-2xl border-l-[3px] border-t-[3px] border-primary" />
              <span aria-hidden className="pointer-events-none absolute right-8 top-8 h-8 w-8 rounded-tr-2xl border-r-[3px] border-t-[3px] border-primary" />
              <span aria-hidden className="pointer-events-none absolute bottom-8 left-8 h-8 w-8 rounded-bl-2xl border-b-[3px] border-l-[3px] border-primary" />
              <span aria-hidden className="pointer-events-none absolute bottom-8 right-8 h-8 w-8 rounded-br-2xl border-b-[3px] border-r-[3px] border-primary" />
              <span
                aria-hidden
                className="beam-scan-line pointer-events-none absolute inset-x-10 h-0.5 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_14px_rgba(16,185,129,0.7)]"
              />
              <p className="absolute inset-x-0 bottom-4 text-center text-xs font-medium text-white/85">
                Searching for a QR code…
              </p>
            </>
          )}

          {(state === 'idle' || state === 'starting') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
              <p className="text-sm">Starting camera…</p>
            </div>
          )}

          {state === 'denied' && (
            <ScannerMessage
              icon={<CameraOff className="h-7 w-7 text-destructive" aria-hidden />}
              title="Camera access blocked"
              body="Beam needs the camera to scan. Allow camera access in your browser settings, or type the pairing key instead."
            />
          )}

          {state === 'unsupported' && (
            <ScannerMessage
              icon={<CameraOff className="h-7 w-7 text-amber-600 dark:text-amber-400" aria-hidden />}
              title="Scanning not available here"
              body="This browser can't detect QR codes in-app. Use your phone's Camera app on the QR, or enter the pairing key manually."
            />
          )}

          {state === 'error' && (
            <ScannerMessage
              icon={<CameraOff className="h-7 w-7 text-destructive" aria-hidden />}
              title="Camera unavailable"
              body={errorHint ?? 'The camera could not be started. Close other apps using it and try again.'}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5">
          <p className="text-xs text-muted-foreground">Nothing is uploaded — scanning happens on your phone.</p>
          {(state === 'denied' || state === 'error' || state === 'scanning') && (
            <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => void startCamera()}>
              <Camera className="h-3.5 w-3.5" aria-hidden />
              Retry
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ScannerMessage({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-background/90">{icon}</span>
      <p className="font-semibold text-white/95">{title}</p>
      <p className="text-sm leading-relaxed text-white/70">{body}</p>
    </div>
  )
}
