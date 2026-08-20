import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App'
// index.css (old Tailwind HSL tokens, still used by unported pages) loads FIRST, ds/*.css
// second — deliberately, not per DESIGN-SYSTEM.md §2's tokens → base → components → page order.
// index.css's :root also still declares --accent and --radius (old HSL-channel/rem values, not
// full color functions), the same custom property names ds/tokens.css uses for its own,
// unrelated oklch()/zero values. Two same-named `:root` declarations don't merge or namespace —
// whichever loads last wins the whole property. Landing ds/*.css last guarantees the new system's
// values always win that collision, until the old tokens are deleted once every page is ported
// (see the Mechanics checklist) and this ordering concern disappears on its own.
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
