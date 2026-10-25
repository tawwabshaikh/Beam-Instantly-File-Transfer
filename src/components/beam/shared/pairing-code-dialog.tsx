'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function PairingCodeDialog({
  open,
  onOpenChange,
  onSubmitCode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitCode: (code: string) => void
}) {
  const [code, setCode] = useState('')
  const normalizedCode = code.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden />
            Pair with your phone
          </DialogTitle>
          <DialogDescription>
            Enter the 6-character pairing code shown on the phone that created the session.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (normalizedCode.length !== 6) return
            onOpenChange(false)
            onSubmitCode(normalizedCode)
          }}
        >
          <Input
            autoFocus
            autoComplete="one-time-code"
            aria-label="Phone pairing code"
            placeholder="7J9SVA"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="h-12 text-center font-mono text-xl uppercase tracking-[0.3em]"
            maxLength={8}
          />
          <Button type="submit" className="w-full" disabled={normalizedCode.length !== 6}>
            Connect to phone
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
