import { useParams } from 'react-router-dom'

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <main className="container mx-auto py-10">
      <h1 className="text-3xl font-bold">Analysis complete</h1>
      <p className="mt-4 text-muted-foreground">
        Results for analysis {id} — full results UI coming in ticket 08.
      </p>
    </main>
  )
}
