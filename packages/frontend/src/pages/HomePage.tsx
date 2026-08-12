import { Button } from '@/components/ui/button'

export default function HomePage() {
  return (
    <main className="container mx-auto py-10">
      <h1 className="text-3xl font-bold">Home — paste a seed article URL</h1>
      <p className="mt-4 text-muted-foreground">Enter a news article URL to begin triangulation.</p>
      <Button className="mt-6">Get started</Button>
    </main>
  )
}
