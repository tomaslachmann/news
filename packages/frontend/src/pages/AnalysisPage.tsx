import { useParams } from 'react-router-dom'

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <main className="container mx-auto py-10">
      <h1 className="text-3xl font-bold">Analysis — results</h1>
      <p className="mt-4 text-muted-foreground">Analysis ID: {id}</p>
    </main>
  )
}
