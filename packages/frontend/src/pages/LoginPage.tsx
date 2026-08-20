import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { login, type LoginBody } from '@/services/auth'
import './LoginPage.css'

/** Ticket 26's internal-tool framing survives ticket 39's re-skin: a bare bordered box, an
 *  explicit internal-use note, no marketing copy or hero framing — the design system's own
 *  `.login`/`.login__box` happen to match this framing already, not a coincidence (the reference
 *  itself calls this "Interní nástroj pro personál"). */
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
    <main className="u-wrap login">
      <div className="login__in">
        <div className="login__brand">
          <span className="login__word">
            News <em>Triangulator</em>
          </span>
          <span className="abar__tag">Interní</span>
        </div>

        <div className="login__box">
          <h1 className="login__t">Přihlášení</h1>
          <p className="login__n">Interní nástroj pro personál — nejde o veřejnou registraci.</p>

          {mutation.isError && (
            <div className="error">
              <p className="error__t">Přihlášení se nepovedlo</p>
              <p className="error__p">Neplatný e-mail nebo heslo. Zkuste to prosím znovu.</p>
            </div>
          )}

          <form className="login__f" onSubmit={handleSubmit}>
            <div className="field">
              <label className="field__l" htmlFor="lEmail">
                E-mail
              </label>
              <input
                className="input"
                id="lEmail"
                type="email"
                autoComplete="username"
                placeholder="jmeno@newstriangulator.cz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field__l" htmlFor="lPass">
                Heslo
              </label>
              <input
                className="input"
                id="lPass"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn btn--primary" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Přihlašování…' : 'Přihlásit se'}
            </button>
          </form>

          <p className="login__foot">
            Přístup přiděluje správce. Ztracené heslo nelze obnovit e-mailem — požádejte správce o nastavení
            nového.
          </p>
        </div>
      </div>
    </main>
  )
}
