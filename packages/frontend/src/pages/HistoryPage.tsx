import { Link } from 'react-router-dom'
import type { AnalysisListItem } from '@/services/analyses'
import { useAnalysesList } from '@/services/analyses/hooks'
import { useAuth } from '@/context/AuthContext'

const dateFormatter = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

const STATUS_STYLES: Record<AnalysisListItem['status'], string> = {
  draft: 'bg-blue-100 text-blue-800',
  complete: 'bg-green-100 text-green-800',
  failed: 'bg-destructive/10 text-destructive',
  pending: 'bg-muted text-muted-foreground',
}

const STATUS_LABELS: Record<AnalysisListItem['status'], string> = {
  draft: 'Koncept',
  complete: 'Dokončeno',
  failed: 'Selhalo',
  pending: 'Zpracovává se',
}

function StatusBadge({ status }: { status: AnalysisListItem['status'] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

function HistoryEntry({ item }: { item: AnalysisListItem }) {
  return (
    <li>
      <Link
        to={`/analysis/${item.id}`}
        className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 hover:bg-secondary/50"
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{item.seedHeadline}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(item.createdAt)} · zdrojů: {item.coverageCount}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </Link>
    </li>
  )
}

export default function HistoryPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const { data: analyses, isLoading, isError } = useAnalysesList()

  return (
    <main className="container mx-auto py-10 max-w-3xl">
      <h1 className="text-3xl font-bold">{isAdmin ? 'Historie' : 'Články'}</h1>
      <p className="mt-2 text-muted-foreground">
        {isAdmin ? 'Procházejte své předchozí analýzy.' : 'Procházejte starší články.'}
      </p>

      {isLoading && <p className="mt-8 text-muted-foreground">Načítání…</p>}

      {isError && <p className="mt-8 text-destructive">Nepodařilo se načíst data.</p>}

      {analyses && analyses.length === 0 && (
        <div className="mt-8 rounded-lg border bg-card p-8 text-center">
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
        <ul className="mt-8 flex flex-col gap-3">
          {analyses.map((item) => (
            <HistoryEntry key={item.id} item={item} />
          ))}
        </ul>
      )}
    </main>
  )
}
