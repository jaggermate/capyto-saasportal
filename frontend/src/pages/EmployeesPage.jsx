import React, { useEffect, useMemo, useState } from 'react'
import { getCompany, getPrices, listEmployees, listTransactions } from '../services/api.js'
import { getEmployeeTransactions, numberify, resolveGrossSalary, resolveNetSalary } from '../utils/employees.js'

const formatFiat = (value, fiat) => {
  const num = numberify(value)
  return `${num.toFixed(2)} ${fiat}`
}

export default function EmployeesPage() {
  const [company, setCompany] = useState(null)
  const [employees, setEmployees] = useState([])
  const [transactions, setTransactions] = useState([])
  const [prices, setPrices] = useState({})
  const [fiat, setFiat] = useState('CAD')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    getCompany().then(c => {
      setCompany(c)
      if (c?.base_fiat) {
        setFiat(c.base_fiat)
      }
    })
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [empList, txList, priceRes] = await Promise.all([
          listEmployees(),
          listTransactions(),
          getPrices(fiat),
        ])
        if (!active) return
        setEmployees(empList)
        setTransactions(txList)
        setPrices(priceRes.prices || {})
      } catch (e) {
        console.error('Failed to load employees', e)
      } finally {
        if (active) setLoading(false)
      }
    }
    if (fiat) {
      load()
    }
    return () => {
      active = false
    }
  }, [fiat])

  const selectedEmployee = useMemo(
    () => employees.find(e => e.user_id === selectedId),
    [employees, selectedId]
  )

  const selectedTransactions = useMemo(
    () => getEmployeeTransactions(selectedEmployee, transactions, prices),
    [selectedEmployee, transactions, prices]
  )

  const selectedGross = selectedEmployee ? resolveGrossSalary(selectedEmployee) : 0
  const selectedNet = selectedEmployee ? resolveNetSalary(selectedEmployee) : 0

  const closeModal = () => setSelectedId(null)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <div className="title mb-1">Employees overview</div>
          <div className="text-sm text-gray-500 dark:text-slate-400">
            Click any row to inspect personal details and transaction history.
          </div>
        </div>
        <div className="text-xs text-gray-500">
          Active currency: <span className="font-medium">{fiat}</span>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>User ID</th>
              <th>Mode</th>
              <th>Allocation</th>
              <th>Net salary</th>
              <th>BTC addr</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  Loading employees…
                </td>
              </tr>
            )}
            {!loading && employees.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  No employees yet
                </td>
              </tr>
            )}
            {!loading &&
              employees.map(emp => {
                const displayName = [emp.first_name, emp.last_name].filter(Boolean).join(' ') || '—'
                const net = resolveNetSalary(emp)
                return (
                  <tr key={emp.user_id} className="cursor-pointer hover:bg-blue-50/60 dark:hover:bg-slate-800/60" onClick={() => setSelectedId(emp.user_id)}>
                    <td>{displayName}</td>
                    <td className="font-mono text-xs md:text-sm">{emp.user_id}</td>
                    <td>
                      <span className="badge badge-gray">{emp.convert_mode === 'fixed' ? 'Fixed' : 'Percent'}</span>
                    </td>
                    <td>
                      {emp.convert_mode === 'fixed' ? (
                        <span className="badge badge-purple">{formatFiat(emp.fixed_amount_fiat, fiat)}</span>
                      ) : (
                        <span className="badge badge-blue">{emp.percent_to_crypto}%</span>
                      )}
                    </td>
                    <td>{net > 0 ? formatFiat(net, fiat) : '—'}</td>
                    <td className="text-xs text-gray-500 dark:text-slate-400 truncate max-w-xs">{emp.receiving_addresses?.BTC || '—'}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="subtitle text-gray-500 uppercase tracking-wide">Employee</div>
                <div className="title">{[selectedEmployee.first_name, selectedEmployee.last_name].filter(Boolean).join(' ') || selectedEmployee.user_id}</div>
                <div className="text-xs text-gray-500 font-mono">{selectedEmployee.user_id}</div>
              </div>
              <button className="btn btn-secondary" onClick={closeModal}>Close</button>
            </div>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="p-4 rounded-lg border border-gray-100 dark:border-slate-700">
                <div className="text-gray-500 text-xs uppercase">Address</div>
                <div>{selectedEmployee.address || 'No address on file'}</div>
              </div>
              <div className="p-4 rounded-lg border border-gray-100 dark:border-slate-700">
                <div className="text-gray-500 text-xs uppercase">Salary (gross)</div>
                <div className="font-semibold text-lg">{selectedGross > 0 ? formatFiat(selectedGross, fiat) : 'Not provided'}</div>
              </div>
              <div className="p-4 rounded-lg border border-gray-100 dark:border-slate-700">
                <div className="text-gray-500 text-xs uppercase">Salary (net)</div>
                <div className="font-semibold text-lg">{selectedNet > 0 ? formatFiat(selectedNet, fiat) : 'Not provided'}</div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-gray-100 dark:border-slate-700 space-y-3">
                <div className="subtitle">Conversion preferences</div>
                <div className="text-sm text-gray-600 dark:text-slate-300">
                  Mode: <span className="font-medium">{selectedEmployee.convert_mode === 'fixed' ? 'Fixed amount per pay' : 'Percent of net pay'}</span>
                </div>
                {selectedEmployee.convert_mode === 'fixed' ? (
                  <div className="text-sm">Amount: <span className="font-semibold">{formatFiat(selectedEmployee.fixed_amount_fiat, fiat)}</span></div>
                ) : (
                  <div className="text-sm">Percent to crypto: <span className="font-semibold">{selectedEmployee.percent_to_crypto}%</span></div>
                )}
                <div>
                  <div className="text-xs uppercase text-gray-500 mb-1">Crypto split</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(selectedEmployee.crypto_split || {}).map(([sym, pct]) => (
                      <span key={sym} className="badge badge-outline">{sym}: {pct}%</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-lg border border-gray-100 dark:border-slate-700">
                <div className="subtitle mb-2">Deposit addresses</div>
                <div className="space-y-2 text-sm">
                  {Object.entries(selectedEmployee.receiving_addresses || {}).map(([sym, addr]) => (
                    <div key={sym}>
                      <div className="text-xs text-gray-500 uppercase">{sym}</div>
                      <div className="font-mono text-xs break-all">{addr || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="subtitle mb-2">Transaction history</div>
              <div className="overflow-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Asset</th>
                      <th>Crypto</th>
                      <th>Value at payout</th>
                      <th>Current value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTransactions.map(tx => (
                      <tr key={tx.id}>
                        <td>{new Date(tx.date).toLocaleString()}</td>
                        <td>{tx.crypto_symbol}</td>
                        <td>{tx.crypto_amount.toFixed(6)} {tx.crypto_symbol}</td>
                        <td>{tx.value_at_tx.toFixed(2)} {tx.fiat_currency}</td>
                        <td>{tx.current_value.toFixed(2)} {tx.fiat_currency}</td>
                        <td><span className={`badge ${tx.status === 'confirmed' ? 'badge-green' : 'badge-yellow'}`}>{tx.status}</span></td>
                      </tr>
                    ))}
                    {selectedTransactions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                          No transactions yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          </div>
      )}
    </div>
  )
}
