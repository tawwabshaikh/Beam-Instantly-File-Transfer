'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/beam/logo'
import { useSoundMuted } from '@/hooks/use-sound-muted'
import { cn } from '@/lib/utils'

export type DesktopNavView = 'transfer' | 'history' | 'about'

const NAV_ITEMS: { id: DesktopNavView; label: string }[] = [
  { id: 'transfer', label: 'Transfer' },
  { id: 'history', label: 'History' },
  { id: 'about', label: 'About' },
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
              {item.label}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={toggleMute}
            aria-label={muted ? 'Turn transfer sounds on' : 'Turn transfer sounds off'}
          >
            {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
          </Button>
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
