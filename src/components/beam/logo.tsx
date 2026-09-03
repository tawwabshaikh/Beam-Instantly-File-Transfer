import { cn } from '@/lib/utils'

export function Logo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-10 w-10' : size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
  const icon = size === 'lg' ? 'h-5 w-5' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const text = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-sm' : 'text-base'
  return (
    <span className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <span
        className={cn(
          box,
          'inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm',
        )}
      >
        <svg
          className={icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* lightning bolt — "beam it over" */}
          <path d="M13 2 4.5 13.5h6L11 22l8.5-11.5h-6L13 2Z" />
        </svg>
      </span>
      <span className={cn(text, 'font-semibold tracking-tight')}>Beam</span>
    </span>
  )
}
