import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import EmployeePage from './pages/EmployeePage.jsx'
import CompanyPage from './pages/CompanyPage.jsx'
import CryptoTxPage from './pages/CryptoTxPage.jsx'
import EmployeesPage from './pages/EmployeesPage.jsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <EmployeePage /> },
      { path: 'company', element: <CompanyPage /> },
      { path: 'employees', element: <EmployeesPage /> },
      { path: 'transactions', element: <CryptoTxPage /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
