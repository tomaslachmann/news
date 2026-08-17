import { cn } from '@/lib/utils'

interface PageTitleProps {
  children: React.ReactNode
  /** lg (3xl, top-level pages like Home/History) · sm (2xl, item-detail pages like Article/Review) */
  size?: 'lg' | 'sm'
  className?: string
}

/** Shared serif page-title heading (ticket 22) — every page's `<h1>` goes through this instead
 *  of hand-typing `font-serif text-Xxl font-bold`, so a page can't silently end up non-serif
 *  the way AnalysisPage's did before this existed. */
export function PageTitle({ children, size = 'lg', className }: PageTitleProps) {
  return (
    <h1 className={cn('font-serif font-bold', size === 'lg' ? 'text-3xl' : 'text-2xl', className)}>
      {children}
    </h1>
  )
}
