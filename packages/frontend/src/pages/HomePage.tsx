import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

export default function HomePage() {
  const { user } = useAuth()

  return (
    <main className="container mx-auto py-10">
      <h1 className="text-3xl font-bold">Home — paste a seed article URL</h1>
      <p className="mt-4 text-muted-foreground">Enter a news article URL to begin triangulation.</p>
      {user?.role === 'ADMIN' && (
        <Button className="mt-6">Get started</Button>
      )}
    </main>
  )
}
