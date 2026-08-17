import { Link } from 'react-router-dom'
import type { AnalysisListItem } from '@/services/analyses'
import { useAnalysesList } from '@/services/analyses/hooks'
import { PageContainer } from '@/components/PageContainer'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/formatDate'
import { cn } from '@/lib/utils'

const STATUS_LABELS: Record<AnalysisListItem['status'], string> = {
  draft: 'Koncept',
  complete: 'Dokončeno',
  failed: 'Selhalo',
  pending: 'Zpracovává se',
}

function StatusLabel({ status }: { status: AnalysisListItem['status'] }) {
  return (
    <span className={cn('utility-label shrink-0', status === 'failed' && 'text-destructive')}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function HistoryEntry({ item }: { item: AnalysisListItem }) {
  return (
    <li>
      <Link
        to={`/analysis/${item.id}`}
        className="flex items-center justify-between gap-4 py-4 hover:bg-muted/30"
      >
        <div className="min-w-0">
          <p className="truncate font-serif text-lg font-semibold">{item.title}</p>
          <p className="mt-1 font-sans text-xs text-muted-foreground">
            {formatDate(item.createdAt)} · zdrojů: {item.coverageCount}
          </p>
        </div>
        <StatusLabel status={item.status} />
      </Link>
    </li>
  )
}

export default function HistoryPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const { data: analyses, isLoading, isError } = useAnalysesList()

  return (
    <PageContainer className="font-serif">
      <h1 className="utility-label">{isAdmin ? 'Historie' : 'Články'}</h1>
      <p className="mt-2 font-sans text-muted-foreground">
        {isAdmin ? 'Procházejte své předchozí analýzy.' : 'Procházejte starší články.'}
      </p>

      {isLoading && <p className="mt-8 font-sans text-muted-foreground">Načítání…</p>}

      {isError && <p className="mt-8 font-sans text-destructive">Nepodařilo se načíst data.</p>}

      {analyses && analyses.length === 0 && (
        <div className="mt-8 border p-8 text-center font-sans">
          {isAdmin ? (
            <>
              <p className="text-muted-foreground">Zatím žádné analýzy.</p>
              <Link to="/" className="mt-2 inline-block text-sm text-primary underline">
                Spustit analýzu
              </Link>
            </>
          ) : (
            <p className="text-muted-foreground">Zatím žádné články — zkuste to brzy znovu.</p>
          )}
        </div>
      )}

      {analyses && analyses.length > 0 && (
        <ul className="mt-4 divide-y border-b border-t">
          {analyses.map((item) => (
            <HistoryEntry key={item.id} item={item} />
          ))}
        </ul>
      )}
    </PageContainer>
  )
}
