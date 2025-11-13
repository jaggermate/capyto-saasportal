import axios from 'axios'

const envBase = import.meta.env.VITE_API_BASE?.trim()

const isBrowser = typeof window !== 'undefined'

const browserDefault = isBrowser
  ? window.location.origin.includes('localhost')
    ? 'http://localhost:8000'
    : `${window.location.origin}/api`
  : 'http://localhost:8000'

const isInternalDockerHost = value => {
  if (!value || value.startsWith('/')) return false
  try {
    const { hostname } = new URL(value)
    return hostname === 'capytosaas-backend'
  } catch (err) {
    return false
  }
}

const API_BASE = envBase && !isInternalDockerHost(envBase) ? envBase : browserDefault

export const api = axios.create({
  baseURL: API_BASE,
})

export const getSupported = () => api.get('/supported').then(r => r.data)
export const getCompany = () => api.get('/company').then(r => r.data)
export const updateCompany = (data) => api.put('/company', data).then(r => r.data)
export const listEmployees = () => api.get('/employees').then(r => r.data)
export const upsertEmployee = (payload) => api.post('/employees', payload).then(r => r.data)
export const getPrices = (fiat='CAD') => api.get('/prices', { params: { fiat }}).then(r => r.data)
export const listTransactions = () => api.get('/transactions').then(r => r.data)
export const runPayroll = (payload) => api.post('/run-payroll', payload).then(r => r.data)
export const confirmTx = (id) => api.post(`/transactions/${id}/confirm`).then(r => r.data)
export const syncUsers = () => api.post('/sync').then(r => r.data)
