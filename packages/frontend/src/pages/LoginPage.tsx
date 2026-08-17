import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/PageContainer'
import { PageTitle } from '@/components/PageTitle'
import { login, type LoginBody } from '@/services/auth'
import { useChromeVariant } from '@/components/PrototypeSwitcher'

/** PROTOTYPE — ticket 26's login round: per docs/research §10, this is an internal back-office
 *  tool (no public accounts exist), not a subscriber gate — so every variant drops marketing
 *  copy/hero framing and just varies how much visual "weight" the form itself carries.
 *  Switchable via `?variant=A|B|C`, dev builds only; falls back to a single baseline in production. */
function loginFormChrome(variant: 'A' | 'B' | 'C') {
  if (variant === 'B') {
    return {
      wrapperClassName: 'rounded-lg border bg-card p-8 shadow-sm',
      note: null as string | null,
    }
  }
  if (variant === 'C') {
    return {
      wrapperClassName: 'font-mono',
      note: null,
    }
  }
  return {
    wrapperClassName: 'border p-8',
    note: 'Interní nástroj pro personál — nejde o veřejnou registraci.',
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const chromeVariant = useChromeVariant()

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

  const chrome = import.meta.env.DEV
    ? loginFormChrome(chromeVariant)
    : { wrapperClassName: '', note: null as string | null }

  return (
    <PageContainer width="narrow">
      <PageTitle size="sm" className="mb-6">
        Přihlášení
      </PageTitle>
      <div className={chrome.wrapperClassName}>
        {chrome.note && <p className="mb-4 text-xs text-muted-foreground">{chrome.note}</p>}
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
              className={chrome.wrapperClassName.includes('font-mono') ? 'rounded-none font-mono' : undefined}
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
              className={chrome.wrapperClassName.includes('font-mono') ? 'rounded-none font-mono' : undefined}
            />
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive">Neplatný e-mail nebo heslo. Zkuste to prosím znovu.</p>
          )}
          <Button
            type="submit"
            disabled={mutation.isPending}
            className={chrome.wrapperClassName.includes('font-mono') ? 'rounded-none' : undefined}
          >
            {mutation.isPending ? 'Přihlašování…' : 'Přihlásit se'}
          </Button>
        </form>
      </div>
    </PageContainer>
  )
}
