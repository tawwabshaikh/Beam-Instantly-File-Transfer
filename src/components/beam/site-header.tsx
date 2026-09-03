'use client'

import { useTheme } from 'next-themes'
import { Languages, Moon, Sun, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Logo } from '@/components/beam/logo'
import { InstallPwaButton } from '@/components/beam/install-pwa-button'
import { useLang, type Lang } from '@/lib/beam/i18n'
import { useSoundMuted } from '@/hooks/use-sound-muted'
import { cn } from '@/lib/utils'

export type DesktopNavView = 'transfer' | 'history' | 'about'

const NAV_ITEMS: { id: DesktopNavView; key: string }[] = [
  { id: 'transfer', key: 'nav.transfer' },
  { id: 'history', key: 'nav.history' },
  { id: 'about', key: 'nav.about' },
]

const LANG_ITEMS: { id: Lang; label: string; hint: string }[] = [
  { id: 'en', label: 'English', hint: 'EN' },
  { id: 'hi', label: 'हिन्दी', hint: 'हिं' },
]

export function SiteHeader({
  view,
  onNavigate,
}: {
  view: DesktopNavView
  onNavigate: (v: DesktopNavView) => void
}) {
  const { resolvedTheme, setTheme } = useTheme()
  const { muted, toggle: toggleMute } = useSoundMuted()
  const { lang, setLang, t } = useLang()
  const activeLang = LANG_ITEMS.find((l) => l.id === lang) ?? LANG_ITEMS[0]

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => onNavigate('transfer')}
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          aria-label="Beam home"
        >
          <Logo />
        </button>

        <nav aria-label="Main navigation" className="flex items-center gap-1 sm:gap-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                view === item.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              {t(item.key)}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
          <InstallPwaButton />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={toggleMute}
            aria-label={muted ? 'Turn transfer sounds on' : 'Turn transfer sounds off'}
          >
            {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
          </Button>

          {/* Language switcher — English / हिन्दी */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 px-2.5"
                aria-label={t('lang.aria')}
                title={t('lang.aria')}
              >
                <Languages className="h-4 w-4" aria-hidden />
                <span className="hidden text-xs font-medium sm:inline">{activeLang.hint}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
              <DropdownMenuLabel className="text-xs text-muted-foreground">{t('lang.aria')}</DropdownMenuLabel>
              {LANG_ITEMS.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => setLang(item.id)}
                  className={cn('justify-between', item.id === lang && 'bg-accent text-accent-foreground')}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.id === lang ? (
                    <span aria-hidden className="text-xs text-primary">
                      ✓
                    </span>
                  ) : (
                    <span className="sr-only">—</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
          </Button>
        </nav>
      </div>
    </header>
  )
}
