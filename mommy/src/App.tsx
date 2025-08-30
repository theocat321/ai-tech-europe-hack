import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import ChatPage from '@/pages/ChatPage'
import AboutMePage from '@/pages/AboutMePage'

function App() {
  return (
    <Router>
      <div className="w-full min-h-screen">
        <nav className="p-4 bg-gray-100 dark:bg-gray-800">
          <Link to="/" className="mr-4">Home</Link>
          <Link to="/about-me">About Me</Link>
        </nav>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/about-me" element={<AboutMePage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
