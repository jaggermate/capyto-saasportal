import React, { useEffect, useMemo, useState } from 'react'
import DashboardTable from '../components/DashboardTable.jsx'
import TransactionsTable from '../components/TransactionsTable.jsx'
import { confirmTx, getCompany, getPrices, getSupported, listEmployees, listTransactions, runPayroll, updateCompany } from '../services/api.js'
import { numberify, resolveNetSalary } from '../utils/employees.js'

const toNumber = (value) => numberify(value)

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
  const [company, setCompany] = useState({ custody: false, company_wallets: { BTC: '', ETH: '', USDT: '', USDC: '' }, base_fiat: 'CAD', company_benefit_amount: 0 })
  const [employees, setEmployees] = useState([])
  const [txs, setTxs] = useState([])
  const [supported, setSupported] = useState({ cryptos: [], fiats: [] })
  const [prices, setPrices] = useState({})
  const [payroll, setPayroll] = useState({ symbol: 'BTC' })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('settings')
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPayrollModal, setShowPayrollModal] = useState(false)
  const [selectedTx, setSelectedTx] = useState(null)

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

  return (
    <>
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
              <div className="mt-4">
                <div className="label">Company benefit per payroll ({company.base_fiat})</div>
                <input type="number" min="0" step="0.01" className="input" value={company.company_benefit_amount ?? 0}
                       onChange={e => {
                         const val = e.target.value
                         setCompany(prev => ({...prev, company_benefit_amount: val === '' ? 0 : Number(val)}))
                       }} />
                <div className="text-xs text-gray-500 mt-1">Converted each run in addition to employee allocations. Requires a wallet for the selected crypto.</div>
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
                  <div>
                    <div className="text-2xl font-semibold">{totalToConvert.toFixed(2)} {company.base_fiat}</div>
                    {toNumber(company.company_benefit_amount) > 0 && (
                      <div className="text-xs text-gray-500">Includes {toNumber(company.company_benefit_amount).toFixed(2)} {company.base_fiat} company benefit.</div>
                    )}
                  </div>
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
          <DashboardTable employees={employees} fiat={company.base_fiat} />
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
          <TransactionsTable items={txs} onSelect={setSelectedTx} />
        )}
      </div>
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
            <div className="flex justify-between gap-4">
              <div>
                <div className="subtitle text-gray-500 uppercase tracking-wide">Transaction details</div>
                <div className="title">{new Date(selectedTx.date).toLocaleString()}</div>
                <div className="text-xs text-gray-500 font-mono break-all">{selectedTx.tx_hash}</div>
              </div>
              <button className="btn btn-secondary" onClick={()=>setSelectedTx(null)}>Close</button>
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
