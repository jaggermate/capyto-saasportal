import React, { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { syncUsers } from './services/api.js'

export default function App() {
  const [dark, setDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-950">
      <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-slate-900/60 border-b border-gray-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-xl font-semibold">Crypto Payroll</div>
          <nav className="flex items-center gap-6">
            {[
              { to: '/', label: 'Employee', end: true },
              { to: '/employees', label: 'Employees' },
              { to: '/company', label: 'Company' },
              { to: '/transactions', label: 'Crypto transactions' },
            ].map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `relative text-sm transition-colors ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-slate-300'}`
                }
              >
                {({ isActive }) => (
                  <span className="inline-flex items-center">
                    {link.label}
                    <span className={`absolute -bottom-1 left-0 h-0.5 rounded-full transition-all ${isActive ? 'w-full bg-blue-600 dark:bg-blue-400' : 'w-0 bg-transparent'}`}></span>
                  </span>
                )}
              </NavLink>
            ))}
            <button
              aria-label="Sync users"
              className="ml-2 btn btn-primary"
              onClick={async () => {
                try {
                  const newUser = await syncUsers()
                  // Broadcast a global event so pages can refresh
                  window.dispatchEvent(new CustomEvent('users:synced', { detail: newUser }))
                } catch (e) {
                  console.error('Sync failed', e)
                  alert('Failed to sync users')
                }
              }}
            >
              Sync users
            </button>
            <button
              aria-label="Toggle dark mode"
              className="ml-2 btn btn-secondary"
              onClick={() => setDark(d => !d)}
            >
              {dark ? 'Light' : 'Dark'}
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
      <footer className="text-center text-xs text-gray-500 dark:text-slate-400 py-6">MVP for demo purposes only.</footer>
    </div>
  )
}
