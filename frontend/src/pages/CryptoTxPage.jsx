import React, { useEffect, useMemo, useState } from 'react'
import TransactionsTable from '../components/TransactionsTable.jsx'
import PortfolioCard from '../components/PortfolioCard.jsx'
import { getCompany, getPrices, listEmployees, listTransactions } from '../services/api.js'

const statusFilters = [
  { label: 'All', value: 'all' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Pending', value: 'pending' },
]

const currencyFormatter = (value, currency = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'BTC' ? 8 : 2,
  }).format(value)

export default function CryptoTxPage() {
  const [txs, setTxs] = useState([])
  const [company, setCompany] = useState({ custody: false, company_wallets: {}, base_fiat: 'CAD' })
  const [prices, setPrices] = useState({})
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [assetFilter, setAssetFilter] = useState('all')
  const [search, setSearch] = useState('')

  const holdings = useMemo(() => {
    const bal = { BTC: 0, ETH: 0, USDT: 0, USDC: 0 }
    if (company.custody) {
      txs.forEach(t => {
        bal[t.crypto_symbol] = (bal[t.crypto_symbol] || 0) + t.crypto_amount
      })
    }
    return bal
  }, [txs, company.custody])

  const sortedTxs = useMemo(
    () => [...txs].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [txs],
  )

  const uniqueAssets = useMemo(
    () => Array.from(new Set(txs.map(t => t.crypto_symbol))).sort(),
    [txs],
  )

  const filteredTxs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return sortedTxs.filter(tx => {
      const matchesStatus = statusFilter === 'all' || tx.status === statusFilter
      const matchesAsset = assetFilter === 'all' || tx.crypto_symbol === assetFilter
      const matchesSearch =
        !query ||
        `${tx.tx_hash} ${tx.crypto_symbol} ${tx.fiat_currency}`
          .toLowerCase()
          .includes(query)
      return matchesStatus && matchesAsset && matchesSearch
    })
  }, [sortedTxs, statusFilter, assetFilter, search])

  const totalVolume = useMemo(
    () => txs.reduce((sum, tx) => sum + tx.fiat_amount, 0),
    [txs],
  )
  const pendingVolume = useMemo(
    () => txs.filter(tx => tx.status !== 'confirmed').reduce((sum, tx) => sum + tx.fiat_amount, 0),
    [txs],
  )
  const avgEmployees = useMemo(() => {
    if (!txs.length) return 0
    const total = txs.reduce((sum, tx) => sum + tx.num_employees, 0)
    return total / txs.length
  }, [txs])

  const nextPayout = useMemo(() => sortedTxs.find(tx => tx.status !== 'confirmed'), [sortedTxs])
  const lastRun = sortedTxs[0]
  const numEmployees = employees.length

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [c, t, emps] = await Promise.all([getCompany(), listTransactions(), listEmployees()])
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

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.3fr,1fr]">
        <section className="card p-6 space-y-5">
          <header className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-blue-500">Transactions</p>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Crypto payroll activity</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Monitor how crypto payouts move through custody, keep an eye on confirmation states, and identify
              batches that may need attention.
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label="Total payroll volume" value={currencyFormatter(totalVolume, company.base_fiat)} hint="Lifetime" />
            <SummaryCard
              label="Awaiting confirmation"
              value={currencyFormatter(pendingVolume, company.base_fiat)}
              hint={`${txs.filter(tx => tx.status !== 'confirmed').length} batches`}
            />
            <SummaryCard
              label="Avg. recipients / run"
              value={avgEmployees.toFixed(1)}
              hint={`${numEmployees} employees listed`}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Chip label={`Base fiat • ${company.base_fiat}`} />
            <Chip label={company.custody ? 'Custody: company wallets' : 'Custody: sent to employees'} />
            <Chip label={`Employees • ${numEmployees}`} />
            {lastRun && <Chip label={`Last run • ${new Date(lastRun.date).toLocaleDateString()}`} />}
          </div>
        </section>

        {loading ? (
          <div className="card p-6 space-y-3">
            <div className="skeleton-line w-40"></div>
            <div className="skeleton-line w-24"></div>
            <div className="skeleton-line"></div>
          </div>
        ) : (
          <PortfolioCard custody={company.custody} prices={prices} holdings={holdings} fiat={company.base_fiat} />
        )}
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <InsightCard
          title="Next payout window"
          value={nextPayout ? new Date(nextPayout.date).toLocaleString() : 'Everything settled'}
          detail={nextPayout ? `${nextPayout.crypto_symbol} • ${nextPayout.num_employees} employees` : 'No pending batches'}
        />
        <InsightCard
          title="Conversion coverage"
          value={`${txs.length ? Math.round((txs.filter(tx => tx.status === 'confirmed').length / txs.length) * 100) : 0}%`}
          detail="Runs confirmed in the last 30 days"
        />
        <InsightCard
          title="Top asset"
          value={uniqueAssets[0] || '—'}
          detail={uniqueAssets.length ? `${uniqueAssets.length} assets active` : 'Add your first transaction'}
        />
      </section>

      <section className="card p-5 space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusFilters.map(filter => (
              <button
                key={filter.value}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === filter.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 w-full lg:w-auto lg:flex-row">
            <select
              className="input lg:w-48"
              value={assetFilter}
              onChange={e => setAssetFilter(e.target.value)}
            >
              <option value="all">All assets</option>
              {uniqueAssets.map(symbol => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
            <div className="relative flex-1 lg:w-64">
              <input
                className="input pl-9"
                placeholder="Search hash or currency"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="skeleton-line"></div>
            <div className="skeleton-line"></div>
            <div className="skeleton-line"></div>
          </div>
        ) : (
          <TransactionsTable items={filteredTxs} emptyMessage="No transactions match your filters yet." />
        )}
      </section>
    </div>
  )
}

const SummaryCard = ({ label, value, hint }) => (
  <div className="rounded-xl border border-gray-100 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</p>
    <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{value}</p>
    {hint && <p className="text-xs text-gray-500 dark:text-slate-400">{hint}</p>}
  </div>
)

const Chip = ({ label }) => (
  <span className="rounded-full border border-gray-200 bg-white/70 px-3 py-1 text-xs font-medium text-gray-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
    {label}
  </span>
)

const InsightCard = ({ title, value, detail }) => (
  <div className="card p-4">
    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">{title}</p>
    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{value}</p>
    <p className="text-sm text-gray-500 dark:text-slate-400">{detail}</p>
  </div>
)
