import React, { useEffect, useMemo, useState } from 'react'
import DashboardTable from '../components/DashboardTable.jsx'
import TransactionsTable from '../components/TransactionsTable.jsx'
import { confirmTx, getCompany, getPrices, getSupported, listEmployees, listTransactions, runPayroll, updateCompany } from '../services/api.js'

const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const resolveNetSalary = (employee) => {
  const net = toNumber(employee?.net_salary)
  if (net > 0) return net
  const gross = toNumber(employee?.gross_salary)
  if (gross > 0) {
    return Number((gross * 0.82).toFixed(2))
  }
  return 0
}

function getEmployeeRequestedFiat(employee, symbol, { needsAddress = false } = {}) {
  if (!employee || !symbol) return 0
  const splitPct = toNumber(employee?.crypto_split?.[symbol])
  if (splitPct <= 0) return 0
  if (needsAddress) {
    const addr = employee?.receiving_addresses?.[symbol]
    if (!addr) return 0
  }
  const mode = employee.convert_mode || 'percent'
  let base = 0
  if (mode === 'fixed') {
    base = toNumber(employee.fixed_amount_fiat)
  } else {
    const percentToCrypto = toNumber(employee.percent_to_crypto)
    if (percentToCrypto <= 0) return 0
    const netSalary = resolveNetSalary(employee)
    if (netSalary <= 0) return 0
    base = netSalary * (percentToCrypto / 100)
  }
  if (base <= 0) return 0
  return base * (splitPct / 100)
}

export default function CompanyPage() {
  const [company, setCompany] = useState({ custody: false, company_wallets: { BTC: '', ETH: '', USDT: '', USDC: '' }, base_fiat: 'USD' })
  const [employees, setEmployees] = useState([])
  const [txs, setTxs] = useState([])
  const [supported, setSupported] = useState({ cryptos: [], fiats: [] })
  const [prices, setPrices] = useState({})
  const [payroll, setPayroll] = useState({ symbol: 'BTC' })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('settings')
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSupported().then(setSupported)
    refresh()
  }, [])

  // Refresh when users are synced from header
  useEffect(() => {
    const onSynced = () => refresh()
    window.addEventListener('users:synced', onSynced)
    return () => window.removeEventListener('users:synced', onSynced)
  }, [])

  useEffect(() => {
    getPrices(company.base_fiat).then(res => setPrices(res.prices))
  }, [company.base_fiat])

  const refresh = async () => {
    setLoading(true)
    const [c, emps, t] = await Promise.all([
      getCompany(),
      listEmployees(),
      listTransactions(),
    ])
    setCompany(c)
    setEmployees(emps)
    setTxs(t)
    setLoading(false)
  }

  const saveSettings = async () => {
    setSaving(true)
    const data = await updateCompany(company)
    setCompany(data)
    setSaving(false)
  }

  const totalToConvert = useMemo(() => {
    const symbol = payroll.symbol
    if (!symbol) return 0
    const needsAddress = !company.custody
    return employees.reduce((acc, emp) => acc + getEmployeeRequestedFiat(emp, symbol, { needsAddress }), 0)
  }, [employees, company.custody, payroll.symbol])

  const run = async () => {
    if (totalToConvert <= 0) {
      alert('No eligible employee requests for this crypto. Ensure splits, salaries, and addresses are configured.')
      return
    }
    setRunning(true)
    try {
      await runPayroll({
        payroll_fiat_total: Number(totalToConvert.toFixed(2)),
        crypto_symbol: payroll.symbol,
      })
      await refresh()
    } catch (e) {
      console.error('Run payroll failed', e)
      const msg = e?.response?.data?.detail || e?.message || 'Failed to run payroll'
      alert(msg)
    } finally {
      setRunning(false)
    }
  }

  const confirmFirstPending = async () => {
    const p = txs.find(t => t.status === 'pending')
    if (p) {
      await confirmTx(p.id)
      await refresh()
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-0 overflow-hidden">
        <div className="flex border-b border-gray-100 dark:border-slate-700">
          <button className={`flex-1 py-3 text-sm ${tab==='settings'?'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400':'text-gray-600 dark:text-slate-300'}`} onClick={()=>setTab('settings')}>Company settings</button>
          <button className={`flex-1 py-3 text-sm ${tab==='payroll'?'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400':'text-gray-600 dark:text-slate-300'}`} onClick={()=>setTab('payroll')}>Next payroll</button>
        </div>
        <div className="p-4">
          {tab==='settings' ? (
            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <div className="label">Fiat currency</div>
                    <select className="input" value={company.base_fiat} onChange={e => setCompany(prev => ({...prev, base_fiat: e.target.value}))}>
                      {supported.fiats?.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="label">Custody type</div>
                    <select className="input" value={company.custody ? 'custody' : 'direct'} onChange={e => setCompany(prev => ({...prev, custody: e.target.value === 'custody'}))}>
                      <option value="direct">Pay to employee addresses</option>
                      <option value="custody">Company holds custody</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="subtitle mb-2">Company wallet addresses (used when custody is enabled)</div>
                  <div className="grid md:grid-cols-2 gap-3">
                    {supported.cryptos?.map(sym => (
                      <div key={sym}>
                        <div className="label">{sym} wallet</div>
                        <input className="input" value={company.company_wallets?.[sym] || ''} onChange={e => setCompany(prev => ({...prev, company_wallets: {...prev.company_wallets, [sym]: e.target.value}}))} placeholder={`Enter ${sym} treasury address`} />
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-primary mt-3" onClick={saveSettings} disabled={saving}>{saving?'Saving...':'Save settings'}</button>
                </div>
              </div>
              <div>
                <div className="subtitle mb-1">Total fiat to convert (est.)</div>
                {loading ? (
                  <div className="space-y-2">
                    <div className="skeleton-line w-40"></div>
                    <div className="skeleton-line w-24"></div>
                  </div>
                ) : (
                  <div className="text-2xl font-semibold">{totalToConvert.toFixed(2)} {company.base_fiat}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <div className="label">Crypto to buy</div>
                <select className="input" value={payroll.symbol} onChange={e => setPayroll(prev => ({...prev, symbol: e.target.value}))}>
                  {supported.cryptos?.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="btn btn-primary mt-3" onClick={run} disabled={running || totalToConvert <= 0}>{running?'Running...':'Run payroll'}</button>
                <button className="btn btn-secondary mt-3 ml-2" onClick={confirmFirstPending}>Mark first pending as confirmed</button>
              </div>
              <div>
                <div className="subtitle mb-1">Estimated fiat</div>
                {loading ? <div className="skeleton-line w-32"></div> : <div className="text-2xl font-semibold">{totalToConvert.toFixed(2)} {company.base_fiat}</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="title mb-2">Employees</div>
        {loading ? (
          <div className="card p-4 space-y-2">
            <div className="skeleton-line"></div>
            <div className="skeleton-line"></div>
            <div className="skeleton-line"></div>
          </div>
        ) : (
          <DashboardTable employees={employees} />
        )}
      </div>

      <div>
        <div className="title mb-2">Deposits history</div>
        {loading ? (
          <div className="card p-4 space-y-2">
            <div className="skeleton-line"></div>
            <div className="skeleton-line"></div>
            <div className="skeleton-line"></div>
          </div>
        ) : (
          <TransactionsTable items={txs} />
        )}
      </div>
    </div>
  )
}
