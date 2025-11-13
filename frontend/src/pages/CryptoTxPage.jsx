import React, { useEffect, useMemo, useState } from 'react'
import TransactionsTable from '../components/TransactionsTable.jsx'
import PortfolioCard from '../components/PortfolioCard.jsx'
import { getCompany, getPrices, listEmployees, listTransactions } from '../services/api.js'

export default function CryptoTxPage() {
  const [txs, setTxs] = useState([])
  const [company, setCompany] = useState({ custody: false, company_wallets: {}, base_fiat: 'CAD' })
  const [prices, setPrices] = useState({})
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)

  const holdings = useMemo(() => {
    const bal = { BTC: 0, ETH: 0, USDT: 0, USDC: 0 }
    if (company.custody) {
      txs.forEach(t => {
        bal[t.crypto_symbol] = (bal[t.crypto_symbol] || 0) + t.crypto_amount
      })
    }
    return bal
  }, [txs, company.custody])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [c, t, emps] = await Promise.all([
        getCompany(),
        listTransactions(),
        listEmployees(),
      ])
      setCompany(c)
      setTxs(t)
      setEmployees(emps)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    getPrices(company.base_fiat).then(res => setPrices(res.prices))
  }, [company.base_fiat])

  const numEmployees = employees.length

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="card p-4 space-y-3">
          <div className="skeleton-line w-40"></div>
          <div className="skeleton-line w-24"></div>
          <div className="skeleton-line"></div>
        </div>
      ) : (
        <PortfolioCard custody={company.custody} prices={prices} holdings={holdings} fiat={company.base_fiat} />
      )}
      <div>
        <div className="title mb-2">Latest crypto payrolls</div>
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
      <div className="text-xs text-gray-500 dark:text-slate-400">Employees in company: {numEmployees}</div>
    </div>
  )
}
