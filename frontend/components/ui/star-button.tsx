'use client'

import { cn } from '@/lib/utils'

interface StarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  variant?: 'primary' | 'buy' | 'sell' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export function StarButton({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: StarButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'relative group inline-flex items-center justify-center gap-2',
        'font-semibold tracking-wide transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        // Sizes
        size === 'sm' && 'px-3 py-1.5 text-xs rounded-lg',
        size === 'md' && 'px-4 py-2.5 text-sm rounded-lg',
        size === 'lg' && 'px-5 py-3 text-sm rounded-xl',
        // Variants
        variant === 'primary' && [
          'bg-zinc-900 border border-zinc-700 text-zinc-200',
          'hover:border-purple-500/60 hover:text-white hover:bg-zinc-800',
          'shadow-[0_0_0_0_rgba(168,85,247,0)] hover:shadow-[0_0_16px_2px_rgba(168,85,247,0.18)]',
        ],
        variant === 'buy' && [
          'bg-emerald-600 border border-emerald-500/40 text-white',
          'hover:bg-emerald-500 hover:border-emerald-400/60',
          'shadow-[0_0_0_0_rgba(16,185,129,0)] hover:shadow-[0_0_16px_2px_rgba(16,185,129,0.25)]',
        ],
        variant === 'sell' && [
          'bg-red-600 border border-red-500/40 text-white',
          'hover:bg-red-500 hover:border-red-400/60',
          'shadow-[0_0_0_0_rgba(239,68,68,0)] hover:shadow-[0_0_16px_2px_rgba(239,68,68,0.25)]',
        ],
        variant === 'ghost' && [
          'bg-transparent border border-zinc-700 text-zinc-400',
          'hover:border-zinc-500 hover:text-zinc-200',
        ],
        variant === 'danger' && [
          'bg-transparent border border-red-800/50 text-red-400/70',
          'hover:border-red-600/60 hover:text-red-400',
        ],
        className,
      )}
    >
      {/* Star sparkle — top-right corner */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute -top-px -right-px pointer-events-none',
          'opacity-0 group-hover:opacity-100',
          'transition-opacity duration-300',
        )}
      >
        <StarSparkle variant={variant} />
      </span>

      {children}
    </button>
  )
}

function StarSparkle({ variant }: { variant: string }) {
  const color =
    variant === 'buy' ? '#34d399' :
    variant === 'sell' ? '#f87171' :
    variant === 'danger' ? '#f87171' :
    '#c084fc'

  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="animate-star-spin"
    >
      <path
        d="M7 0L8.27 5.09L13 5.27L9.09 8.36L10.55 13.35L7 10.47L3.45 13.35L4.91 8.36L1 5.27L5.73 5.09L7 0Z"
        fill={color}
        opacity="0.9"
      />
    </svg>
  )
}
