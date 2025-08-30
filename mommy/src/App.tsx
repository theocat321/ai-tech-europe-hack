import { BrowserRouter as Router, Routes, Route, NavLink, Link } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import ChatPage from '@/pages/ChatPage'
import AboutMePage from '@/pages/AboutMePage'
import SummaryPage from '@/pages/SummaryPage'

function App() {
  return (
    <Router>
      <div className="w-full min-h-screen">
        {/* Modern Notion-like top bar */}
        <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
            {/* Brand */}
            <Link to="/" className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted transition-colors">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              <span className="text-sm font-medium tracking-tight">Tiger Mom</span>
            </Link>
            {/* Nav */}
            <nav className="flex items-center gap-1 text-sm">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 transition-colors ${isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}`
                }
              >
                Home
              </NavLink>
              <NavLink
                to="/about-me"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 transition-colors ${isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}`
                }
              >
                My Context
              </NavLink>
            </nav>
            {/* Right side placeholder (e.g., settings/avatar) */}
            <div className="flex items-center gap-2">
              {/* Future: theme toggle or avatar */}
            </div>
          </div>
        </header>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/about-me" element={<AboutMePage />} />
          <Route path="/summary" element={<SummaryPage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
