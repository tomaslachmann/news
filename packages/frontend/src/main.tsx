import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App'
// Layer order per DESIGN-SYSTEM.md §2: tokens → base → components → page. tokens.css/base.css
// land unchanged (ticket 39) — never translated into a JS theme object or merged into Tailwind's
// theme.extend, so dark mode keeps working purely through CSS custom properties.
import './ds/tokens.css'
import './ds/fonts.css'
import './ds/base.css'
import './ds/controls.css'
import './index.css'

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
