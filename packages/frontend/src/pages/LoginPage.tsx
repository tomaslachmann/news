import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/PageContainer'
import { PageTitle } from '@/components/PageTitle'
import { login, type LoginBody } from '@/services/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (body: LoginBody) => login(body),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['me'] })
      const redirect = searchParams.get('redirect') ?? '/'
      void navigate(decodeURIComponent(redirect), { replace: true })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({ email, password })
  }

  return (
    <PageContainer width="narrow">
      <PageTitle size="sm" className="mb-6">
        Přihlášení
      </PageTitle>
      {/* Ticket 26 — styled as an internal back-office tool, not a public subscriber gate: a
          bare bordered box, an explicit internal-use note, no marketing copy or hero framing.
          Per docs/research/2026-news-portal-visual-design.md §10, this is the honest reference
          point (no public accounts exist), not a subscriber-paywall visual language. */}
      <div className="border p-8">
        <p className="mb-4 text-xs text-muted-foreground">
          Interní nástroj pro personál — nejde o veřejnou registraci.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              E-mail
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="admin@example.com"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium">
              Heslo
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive">Neplatný e-mail nebo heslo. Zkuste to prosím znovu.</p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Přihlašování…' : 'Přihlásit se'}
          </Button>
        </form>
      </div>
    </PageContainer>
  )
}
