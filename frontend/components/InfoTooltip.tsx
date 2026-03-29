'use client'

/**
 * InfoTooltip
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable hover tooltip for explaining financial parameters in plain English.
 * Renders a small ⓘ icon; hovering shows a floating explanation card.
 *
 * Extraction: drop this file anywhere — zero dependencies beyond React + Tailwind.
 *
 * Usage:
 *   <InfoTooltip explanation="How much your portfolio value changes per 1pp move." />
 *   <InfoTooltip label="Net Delta" explanation="..." side="right" />
 */

import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'

interface InfoTooltipProps {
  /** Plain-English explanation shown in the tooltip */
  explanation: string
  /** Optional label shown bold at the top of the tooltip card */
  label?: string
  /** Which side the card appears on (default: top) */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Extra class on the wrapper span */
  className?: string
}

export default function InfoTooltip({
  explanation,
  label,
  side = 'top',
  className,
}: InfoTooltipProps) {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(true)
  }

  const hide = () => {
    // Small delay so cursor can reach the card itself
    timeoutRef.current = setTimeout(() => setVisible(false), 100)
  }

  const positionClasses: Record<NonNullable<InfoTooltipProps['side']>, string> = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  return (
    <span
      className={cn('relative inline-flex items-center cursor-help', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {/* ⓘ icon */}
      <span
        className="text-[10px] text-muted/50 hover:text-muted transition-colors select-none leading-none"
        aria-label="More information"
        role="button"
        tabIndex={0}
      >
        ⓘ
      </span>

      {/* Floating card */}
      {visible && (
        <span
          className={cn(
            'absolute z-50 w-56 pointer-events-none',
            positionClasses[side],
          )}
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <span className="block bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 shadow-2xl text-left">
            {label && (
              <span className="block text-[11px] font-semibold text-zinc-200 mb-1">{label}</span>
            )}
            <span className="block text-[11px] text-muted leading-relaxed">{explanation}</span>
          </span>
        </span>
      )}
    </span>
  )
}
