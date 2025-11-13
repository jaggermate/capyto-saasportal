import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import EmployeePage from './pages/EmployeePage.jsx'
import CompanyPage from './pages/CompanyPage.jsx'
import EmployeesPage from './pages/EmployeesPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <EmployeePage /> },
      { path: 'company', element: <CompanyPage /> },
      { path: 'employees', element: <EmployeesPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
