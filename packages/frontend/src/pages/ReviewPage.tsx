import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { fetchAnalysis } from '@/services/analyses'

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('cs-CZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>()

  const { data: analysis, isLoading, isError } = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => fetchAnalysis(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <main className="container mx-auto py-10">
        <p className="text-muted-foreground">Loading sources…</p>
      </main>
    )
  }

  if (isError || !analysis) {
    return (
      <main className="container mx-auto py-10">
        <p className="text-destructive">Failed to load analysis. Please go back and try again.</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto py-10 max-w-3xl">
      <h1 className="text-2xl font-bold">{analysis.seedHeadline}</h1>
      <p className="text-sm text-muted-foreground mt-1">Review discovered coverage before analysis</p>

      {analysis.coverages.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No coverage found for this story. Try adjusting the keywords and searching again.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {analysis.coverages.map((coverage) => (
            <li
              key={coverage.id}
              className="rounded-lg border bg-card p-4 flex flex-col gap-1"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {coverage.outlet}
                  </span>
                  <p className="text-sm font-medium leading-snug line-clamp-2">
                    {coverage.title ?? coverage.articleUrl}
                  </p>
                  {coverage.publishedAt && (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(coverage.publishedAt)}
                    </span>
                  )}
                </div>
                <a
                  href={coverage.articleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
                  aria-label="Open article"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
