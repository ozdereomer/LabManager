import { useState } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'

import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Laboratories from './pages/Laboratories'
import Equipment from './pages/Equipment'
import Maintenance from './pages/Maintenance'
import Settings from './pages/Settings'
import Auth from './pages/Auth'

import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    Boolean(localStorage.getItem('access_token'))
  )

  function handleLogin() {
    setIsAuthenticated(true)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated
              ? <Navigate to="/" replace />
              : <Auth onLogin={handleLogin} />
          }
        />

        <Route
          path="/*"
          element={
            isAuthenticated ? (
              <div className="app-layout">
                <Sidebar />

                <main className="main-content">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/laboratories" element={<Laboratories />} />
                    <Route path="/equipment" element={<Equipment />} />
                    <Route path="/maintenance" element={<Maintenance />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </div>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
