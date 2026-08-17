import { cn } from '@/lib/utils'

const WIDTHS = {
  measure: 'max-w-measure',
  wide: 'max-w-4xl',
  narrow: 'max-w-sm',
  /** AnalysisPage's pre-ticket-22 width, kept as-is: that page's dimension-list tabs weren't
   *  part of this ticket's design work, so widening/narrowing them wasn't a deliberate call —
   *  only the container mechanism (padding/centering) unifies, not the width. */
  default: 'max-w-3xl',
} as const

interface PageContainerProps {
  children: React.ReactNode
  /** measure (70ch, reading/listing pages) · wide (tables) · narrow (login form) · default (3xl, unchanged legacy width) */
  width?: keyof typeof WIDTHS
  className?: string
}

/** Shared page-level wrapper (ticket 22) — every top-level page uses the same
 *  `container mx-auto py-10` padding/centering, differing only in max-width, so
 *  navigating between pages doesn't feel like the margins are shifting underneath you. */
export function PageContainer({ children, width = 'measure', className }: PageContainerProps) {
  return <main className={cn('container mx-auto py-10', WIDTHS[width], className)}>{children}</main>
}
