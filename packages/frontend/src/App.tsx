import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import type { SseEvent } from '@news-triangulator/shared'
import HomePage from './pages/HomePage'
import ReviewPage from './pages/ReviewPage'
import AnalysisPage from './pages/AnalysisPage'
import HistoryPage from './pages/HistoryPage'

// Verify shared types are importable
type _SseEvent = SseEvent

function NavBar() {
  return (
    <nav className="border-b bg-background px-6 py-3 flex gap-6">
      <Link to="/" className="font-semibold text-foreground hover:text-primary">
        News Triangulator
      </Link>
      <Link to="/history" className="text-muted-foreground hover:text-foreground">
        History
      </Link>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background text-foreground">
        <NavBar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/analysis/:id" element={<AnalysisPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
