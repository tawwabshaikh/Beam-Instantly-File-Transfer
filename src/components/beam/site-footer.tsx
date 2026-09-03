'use client'

import { ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/beam/logo'
import { useLang } from '@/lib/beam/i18n'

export function SiteFooter() {
  const { t } = useLang()
  return (
    <footer className="mt-auto safe-bottom border-t border-border/60 bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-4 py-5 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <div className="flex items-center gap-4">
          <Logo size="sm" className="opacity-80" />
          <span className="hidden sm:inline">{t('footer.tag')}</span>
        </div>
        <p className="flex items-center gap-1.5 text-center text-xs sm:text-sm">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          {t('footer.safe')}
        </p>
      </div>
    </footer>
  )
}
