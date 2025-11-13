import React, { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import TransactionsTable from '../components/TransactionsTable.jsx'
import PortfolioCard from '../components/PortfolioCard.jsx'
import { confirmTx, getCompany, getPrices, getSupported, listEmployees, listTransactions, runPayroll } from '../services/api.js'
import { numberify, resolveNetSalary } from '../utils/employees.js'

const toNumber = (value) => numberify(value)

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
  // Helpers: export and print
  const downloadFile = (filename, mime, content) => {
    const blob = new Blob([content], { type: mime + ';charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const toCSV = (rows) => {
    const esc = (v) => {
      if (v == null) return ''
      const s = String(v)
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
      return s
    }
    if (!rows || rows.length === 0) return ''
    const headers = Object.keys(rows[0])
    const lines = [headers.map(esc).join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))]
    return lines.join('\n')
  }

  const exportTransactionsCSV = (items) => {
    const rows = (items || []).map(t => ({
      date: new Date(t.date).toISOString(),
      tx_hash: t.tx_hash,
      status: t.status,
      crypto_symbol: t.crypto_symbol,
      crypto_amount: Number(t.crypto_amount).toFixed(6),
      fiat_amount: Number(t.fiat_amount).toFixed(2),
      fiat_currency: t.fiat_currency,
      price_at_tx: Number(t.price_at_tx).toFixed(2),
      num_employees: t.num_employees,
    }))
    downloadFile('transactions.csv', 'text/csv', toCSV(rows))
  }

  const exportSingleTxCSV = (tx) => {
    const headerRow = [{
      date: new Date(tx.date).toISOString(),
      tx_hash: tx.tx_hash,
      status: tx.status,
      crypto_symbol: tx.crypto_symbol,
      crypto_amount: Number(tx.crypto_amount).toFixed(6),
      fiat_amount: Number(tx.fiat_amount).toFixed(2),
      fiat_currency: tx.fiat_currency,
      price_at_tx: Number(tx.price_at_tx).toFixed(2),
      num_employees: tx.num_employees,
    }]
    const breakdown = Array.isArray(tx.per_employee_breakdown) ? tx.per_employee_breakdown : []
    const rows = breakdown.map(row => ({
      user: row.is_company ? 'Company benefit' : (row.user_id || ''),
      fiat_amount: Number(row.fiat_amount || 0).toFixed(2),
      crypto_amount: Number(row.crypto_amount || 0).toFixed(6),
      address: row.address || '',
    }))
    const csv = toCSV(headerRow) + (rows.length ? ('\n\n' + toCSV(rows)) : '')
    downloadFile(`transaction_${tx.tx_hash.slice(0,8)}.csv`, 'text/csv', csv)
  }

  const openPrintWindow = (title, html) => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!doctype html><html><head><title>${title}</title>
      <meta charset='utf-8'/>
      <style>
        body{font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji'; padding:16px; color:#0f172a}
        h1{font-size:18px;margin:0 0 12px}
        table{border-collapse:collapse; width:100%; font-size:12px}
        th,td{border:1px solid #e2e8f0; padding:6px 8px; text-align:left}
        th{background:#f8fafc}
        .muted{color:#64748b; font-size:11px}
      </style>
    </head><body>${html}<script>window.onload = () => { window.print(); }</script></body></html>`)
    win.document.close()
  }

  const printTransactions = (items) => {
    const rows = (items || []).map(t => `
      <tr>
        <td>${new Date(t.date).toLocaleString()}</td>
        <td>${t.tx_hash}</td>
        <td>${t.status}</td>
        <td>${t.crypto_amount.toFixed(6)} ${t.crypto_symbol}</td>
        <td>${t.fiat_amount.toFixed(2)} ${t.fiat_currency}</td>
        <td>@ ${t.price_at_tx.toFixed(2)} ${t.fiat_currency}</td>
        <td>${t.num_employees}</td>
      </tr>`).join('')
    const html = `
      <h1>Transactions export</h1>
      <div class="muted">Generated ${new Date().toLocaleString()}</div>
      <table>
        <thead><tr>
          <th>Date</th><th>Hash</th><th>Status</th><th>Crypto</th><th>Fiat total</th><th>Rate</th><th># Employees</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan=7>No data</td></tr>'}</tbody>
      </table>`
    openPrintWindow('Transactions', html)
  }

  const printSingleTx = (tx) => {
    const head = `
      <h1>Transaction ${tx.tx_hash}</h1>
      <div class="muted">${new Date(tx.date).toLocaleString()} • Status: ${tx.status}</div>
      <p><strong>${tx.crypto_amount.toFixed(6)} ${tx.crypto_symbol}</strong> • ${tx.fiat_amount.toFixed(2)} ${tx.fiat_currency} @ ${tx.price_at_tx.toFixed(2)} ${tx.fiat_currency}</p>
    `
    const breakdown = Array.isArray(tx.per_employee_breakdown) ? tx.per_employee_breakdown : []
    const rows = breakdown.map(row => `
      <tr>
        <td>${row.is_company ? 'Company benefit' : (row.user_id || '')}</td>
        <td>${Number(row.fiat_amount || 0).toFixed(2)} ${tx.fiat_currency}</td>
        <td>${Number(row.crypto_amount || 0).toFixed(6)} ${tx.crypto_symbol}</td>
        <td>${row.address || ''}</td>
      </tr>`).join('')
    const table = `
      <h2>Employee breakdown</h2>
      <table>
        <thead><tr><th>User</th><th>Fiat</th><th>Crypto</th><th>Address</th></tr></thead>
        <tbody>${rows || '<tr><td colspan=4>No data</td></tr>'}</tbody>
      </table>`
    openPrintWindow('Transaction', head + table)
  }
  // Helper UI components from CryptoTxPage
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
  const [company, setCompany] = useState({ custody: false, company_wallets: { BTC: '', ETH: '', USDT: '', USDC: '' }, base_fiat: 'CAD', company_benefit_amount: 0 })
  const [employees, setEmployees] = useState([])
  const [txs, setTxs] = useState([])
  const [supported, setSupported] = useState({ cryptos: [], fiats: [] })
  const [prices, setPrices] = useState({})
  const [payroll, setPayroll] = useState({ symbol: 'BTC' })
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [showPayrollModal, setShowPayrollModal] = useState(false)
  const [selectedTx, setSelectedTx] = useState(null)
  // Filters for transactions section (moved from CryptoTxPage)
  const [statusFilter, setStatusFilter] = useState('all')
  const [assetFilter, setAssetFilter] = useState('all')
  const [search, setSearch] = useState('')

  const PAYROLL_FEE_RATE = 0.0125

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
    setCompany({ ...c, company_benefit_amount: c?.company_benefit_amount ?? 0 })
    setEmployees(emps)
    setTxs(t)
    setLoading(false)
  }


  const totalToConvert = useMemo(() => {
    const symbol = payroll.symbol
    if (!symbol) return 0
    const needsAddress = !company.custody
    const employeePortion = employees.reduce((acc, emp) => acc + getEmployeeRequestedFiat(emp, symbol, { needsAddress }), 0)
    const benefit = toNumber(company.company_benefit_amount)
    return employeePortion + benefit
  }, [employees, company.custody, payroll.symbol, company.company_benefit_amount])

  const startPayroll = () => {
    if (totalToConvert <= 0) {
      alert('No eligible employee requests for this crypto. Ensure splits, salaries, and addresses are configured.')
      return
    }
    const benefit = toNumber(company.company_benefit_amount)
    if (!company.custody && benefit > 0) {
      const wallet = company.company_wallets?.[payroll.symbol]
      if (!wallet) {
        alert(`Add a ${payroll.symbol} company wallet before running payroll with a company benefit amount.`)
        return
      }
    }
    setShowPayrollModal(true)
  }

  const confirmPayroll = async () => {
    setRunning(true)
    try {
      await runPayroll({
        payroll_fiat_total: Number(totalToConvert.toFixed(2)),
        crypto_symbol: payroll.symbol,
      })
      setShowPayrollModal(false)
      await refresh()
    } catch (e) {
      console.error('Run payroll failed', e)
      const msg = e?.response?.data?.detail || e?.message || 'Failed to run payroll'
      alert(msg)
    } finally {
      setRunning(false)
    }
  }

  const selectedRate = prices?.[payroll.symbol] || 0
  const estimatedCrypto = selectedRate > 0 ? totalToConvert / selectedRate : 0
  const feeAmount = totalToConvert * PAYROLL_FEE_RATE

  const confirmFirstPending = async () => {
    const p = txs.find(t => t.status === 'pending')
    if (p) {
      await confirmTx(p.id)
      await refresh()
    }
  }

  // Derived values for moved CryptoTxPage section
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

  return (
    <>
      <div className="space-y-6">
      <div className="card p-0 overflow-hidden">
        <div className="flex border-b border-gray-100 dark:border-slate-700">
          <div className="flex-1 text-center py-3 text-sm text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400">Next payroll</div>
        </div>
        <div className="p-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <div className="label">Crypto to buy</div>
                <select className="input" value={payroll.symbol} onChange={e => setPayroll(prev => ({...prev, symbol: e.target.value}))}>
                  {supported.cryptos?.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="text-xs text-gray-500 mt-2">Step 1: Press “Run payroll” to review the current rates for this cycle.</div>
                <button className="btn btn-primary mt-3" onClick={startPayroll} disabled={running || totalToConvert <= 0}>{running?'Running...':'Run payroll'}</button>
                <button className="btn btn-secondary mt-3 ml-2" onClick={confirmFirstPending}>Mark first pending as confirmed</button>
              </div>
              <div>
                <div className="subtitle mb-1">Estimated fiat</div>
                {loading ? <div className="skeleton-line w-32"></div> : (
                  <div>
                    <div className="text-2xl font-semibold">{totalToConvert.toFixed(2)} {company.base_fiat}</div>
                    {toNumber(company.company_benefit_amount) > 0 && (
                      <div className="text-xs text-gray-500">Includes company benefit</div>
                    )}
                  </div>
                )}
              </div>
            </div>
        </div>
      </div>


      </div>

      {/* Moved CryptoTxPage content below */}
      <div className="space-y-6 mt-6">
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
              <div className="flex gap-2 order-2 lg:order-none">
                <button className="btn btn-secondary" onClick={() => exportTransactionsCSV(filteredTxs)}>Export CSV</button>
                <button className="btn btn-secondary" onClick={() => printTransactions(filteredTxs)}>Export PDF</button>
              </div>
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
            <TransactionsTable items={filteredTxs} emptyMessage="No transactions match your filters yet." onSelect={setSelectedTx} />
          )}
        </section>
      </div>

      {showPayrollModal && (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="subtitle text-gray-500 uppercase tracking-wide">{running ? 'Step 3' : 'Step 2'}</div>
              <div className="title">{running ? 'Processing payroll' : 'Review payroll conversion'}</div>
            </div>
            <button className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-slate-200" onClick={()=>!running && setShowPayrollModal(false)}>Close</button>
          </div>
          {running ? (
            <div className="p-6 text-center space-y-3">
              <div className="text-sm text-gray-600 dark:text-slate-300">
                The transaction is being processed with the broker. This may take a few seconds.
              </div>
              <div className="text-3xl">⏳</div>
              <div className="text-sm text-gray-500">You can close this dialog once processing completes.</div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-slate-300">
                Confirm you agree with the current rate and transaction fee before executing the payroll.
              </p>
              <div className="grid gap-3 text-sm">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between p-3 rounded border border-gray-100 dark:border-slate-700">
                    <div>
                      <div className="text-gray-500">Fiat to convert</div>
                      <div className="font-semibold text-lg">{totalToConvert.toFixed(2)} {company.base_fiat}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500">Fee (1.25%)</div>
                      <div className="font-semibold text-lg text-amber-600">{feeAmount.toFixed(2)} {company.base_fiat}</div>
                    </div>
                  </div>
                  {toNumber(company.company_benefit_amount) > 0 && (
                    <div className="p-3 rounded border border-emerald-100 dark:border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-900/10 text-sm">
                      Company benefit: {toNumber(company.company_benefit_amount).toFixed(2)} {company.base_fiat} will be sent to the company wallet.
                    </div>
                  )}
                </div>
                <div className="p-3 rounded border border-gray-100 dark:border-slate-700">
                  <div className="text-gray-500">Current exchange rate</div>
                  {selectedRate > 0 ? (
                    <div className="font-semibold text-lg">1 {payroll.symbol} ≈ {selectedRate.toFixed(2)} {company.base_fiat}</div>
                  ) : (
                    <div className="text-sm text-red-500">Rate unavailable — please try again.</div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">Est. crypto purchase (before fees): {estimatedCrypto.toFixed(6)} {payroll.symbol}</div>
                </div>
                <div className="p-3 rounded border border-blue-100 dark:border-blue-500/40 bg-blue-50/70 dark:bg-blue-900/20 text-sm text-blue-800 dark:text-blue-200">
                  Step 3: Once you confirm, the transaction will be submitted and marked as processing. You will receive status updates in the Deposits table.
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button className="btn btn-secondary" onClick={()=>!running && setShowPayrollModal(false)} disabled={running}>Cancel</button>
                <button className="btn btn-primary" onClick={confirmPayroll} disabled={running || selectedRate <= 0}>
                  Confirm & Run
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      )}
      {selectedTx && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-6">
            <div className="flex justify-between items-start gap-4">
              <div>
                <div className="subtitle text-gray-500 uppercase tracking-wide">Transaction details</div>
                <div className="title">{new Date(selectedTx.date).toLocaleString()}</div>
                <div className="text-xs text-gray-500 font-mono break-all">{selectedTx.tx_hash}</div>
              </div>
              <div className="flex gap-2 ml-auto">
                <button className="btn btn-secondary" onClick={() => exportSingleTxCSV(selectedTx)}>Export CSV</button>
                <button className="btn btn-secondary" onClick={() => printSingleTx(selectedTx)}>Export PDF</button>
                <button className="btn btn-secondary" onClick={()=>setSelectedTx(null)}>Close</button>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="p-4 rounded-lg border border-gray-100 dark:border-slate-700">
                <div className="text-gray-500 text-xs uppercase">Status</div>
                <div><span className={`badge ${selectedTx.status==='confirmed'?'badge-green':'badge-yellow'}`}>{selectedTx.status}</span></div>
              </div>
              <div className="p-4 rounded-lg border border-gray-100 dark:border-slate-700">
                <div className="text-gray-500 text-xs uppercase">Fiat total</div>
                <div className="font-semibold text-lg">{selectedTx.fiat_amount.toFixed(2)} {selectedTx.fiat_currency}</div>
              </div>
              <div className="p-4 rounded-lg border border-gray-100 dark:border-slate-700">
                <div className="text-gray-500 text-xs uppercase">Crypto amount</div>
                <div className="font-semibold text-lg">{selectedTx.crypto_amount.toFixed(6)} {selectedTx.crypto_symbol}</div>
                <div className="text-xs text-gray-500">Rate @ {selectedTx.price_at_tx.toFixed(2)} {selectedTx.fiat_currency}</div>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-gray-100 dark:border-slate-700">
              <div className="subtitle mb-1">Deposit destinations</div>
              <div className="text-xs text-gray-500 mb-2">({selectedTx.addresses?.length || 0}) addresses</div>
              <div className="grid gap-2 md:grid-cols-2">
                {(selectedTx.addresses || []).map((addr, idx) => (
                  <div key={`${addr}-${idx}`} className="font-mono text-xs break-all bg-gray-50 dark:bg-slate-800/60 rounded px-3 py-2">{addr}</div>
                ))}
                {(!selectedTx.addresses || selectedTx.addresses.length === 0) && <div className="text-sm text-gray-500">No addresses recorded (custody payout).</div>}
              </div>
            </div>
            <div>
              <div className="subtitle mb-2">Employee breakdown</div>
              <div className="overflow-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Fiat</th>
                      <th>Crypto</th>
                      <th>Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(selectedTx.per_employee_breakdown) && selectedTx.per_employee_breakdown.length > 0 ? (
                      selectedTx.per_employee_breakdown.map((row, idx) => {
                        const isCompany = row.is_company
                        const label = isCompany ? 'Company benefit' : (row.user_id || '—')
                        const addr = row.address || (isCompany ? (company.company_wallets?.[selectedTx.crypto_symbol] || '—') : '—')
                        return (
                          <tr key={`${row.user_id || 'company'}-${idx}`}>
                            <td>{label}</td>
                            <td>{Number(row.fiat_amount || 0).toFixed(2)} {selectedTx.fiat_currency}</td>
                            <td>{Number(row.crypto_amount || 0).toFixed(6)} {selectedTx.crypto_symbol}</td>
                            <td className="font-mono text-xs break-all">{addr}</td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">No per-employee data recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
