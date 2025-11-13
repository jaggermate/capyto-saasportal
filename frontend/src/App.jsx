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
            <NavLink
              to="/settings"
              aria-label="Settings"
              className={({ isActive }) => `p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-slate-300'}`}
              title="Settings"
            >
              {({ isActive }) => (
                <span className="inline-flex">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
                    <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 1h-3.8a.5.5 0 0 0-.49.41l-.36 2.54c-.58.22-1.12.52-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L1.72 7.97a.5.5 0 0 0 .12.64l2.03 1.58c-.04.3-.06.61-.06.94s.02.64.06.94L1.84 13.65a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.68.22l2.39-.96c.5.42 1.04.72 1.62.94l.36 2.54c.05.24.25.41.49.41h3.8c.24 0 .44-.17.49-.41l.36-2.54c.58-.22 1.12-.52 1.62-.94l2.39.96c.26.12.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/>
                  </svg>
                  <span className={`absolute -bottom-1 left-0 h-0.5 rounded-full transition-all ${isActive ? 'w-full bg-blue-600 dark:bg-blue-400' : 'w-0 bg-transparent'}`}></span>
                </span>
              )}
            </NavLink>
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
