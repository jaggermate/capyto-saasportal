import React, { useEffect, useMemo, useState } from 'react'
import DashboardTable from '../components/DashboardTable.jsx'
import TransactionsTable from '../components/TransactionsTable.jsx'
import { confirmTx, getCompany, getPrices, getSupported, listEmployees, listTransactions, runPayroll, updateCompany } from '../services/api.js'

export default function CompanyPage() {
  const [company, setCompany] = useState({ custody: false, company_wallets: { BTC: '', ETH: '', USDT: '', USDC: '' }, base_fiat: 'USD' })
  const [employees, setEmployees] = useState([])
  const [txs, setTxs] = useState([])
  const [supported, setSupported] = useState({ cryptos: [], fiats: [] })
  const [prices, setPrices] = useState({})
  const [payroll, setPayroll] = useState({ total: 10000, symbol: 'BTC' })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('settings')
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSupported().then(setSupported)
    refresh()
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
    // naive: sum of a mock fixed salary multiplied by percent to crypto
    const mockSalary = 5000 // per employee per payroll
    const totalPercent = employees.reduce((acc, e) => acc + (e.percent_to_crypto || 0), 0)
    return mockSalary * totalPercent / 100
  }, [employees])

  const run = async () => {
    setRunning(true)
    await runPayroll({ payroll_fiat_total: totalToConvert || payroll.total, crypto_symbol: payroll.symbol })
    await refresh()
    setRunning(false)
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
                  <div className="text-2xl font-semibold">{(totalToConvert || payroll.total).toFixed(2)} {company.base_fiat}</div>
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
                <button className="btn btn-primary mt-3" onClick={run} disabled={running}>{running?'Running...':'Run payroll'}</button>
                <button className="btn btn-secondary mt-3 ml-2" onClick={confirmFirstPending}>Mark first pending as confirmed</button>
              </div>
              <div>
                <div className="subtitle mb-1">Estimated fiat</div>
                {loading ? <div className="skeleton-line w-32"></div> : <div className="text-2xl font-semibold">{(totalToConvert || payroll.total).toFixed(2)} {company.base_fiat}</div>}
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
