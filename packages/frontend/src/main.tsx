import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App'
// ticket 39: index.css used to declare its own --accent/--radius (old HSL-channel values) under
// the same custom-property names ds/tokens.css uses for its oklch()/zero ones — a same-named
// :root collision where whichever loaded last won the whole property, which is why ds/*.css was
// ordered after index.css here. That old :root block (and the semantic-colour theme it backed)
// is gone now that every page is ported — see the Mechanics checklist — so the collision no
// longer exists, but ds/*.css still loads after index.css, matching DESIGN-SYSTEM.md §2's
// tokens → base → components → page order now that there's no reason not to.
import './index.css'
import './ds/tokens.css'
import './ds/fonts.css'
import './ds/base.css'
import './ds/controls.css'
import './ds/components.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </React.StrictMode>
)
