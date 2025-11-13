import React, { useEffect, useMemo, useState } from 'react'
import Slider from '../components/Slider.jsx'
import AddressForm from '../components/AddressForm.jsx'
import MetricCard from '../components/MetricCard.jsx'
import { getPrices, listEmployees, upsertEmployee, getSupported, listTransactions } from '../services/api.js'
import { getEmployeeTransactions, resolveNetSalary } from '../utils/employees.js'

function LastPayday({ employee, fiat, prices, percent, split, convertMode='percent', fixedAmount=0 }) {
  const net = resolveNetSalary(employee)
  const pct = Number(percent || 0)
  const baseToConvert = convertMode === 'fixed' ? Number(fixedAmount || 0) : (net * pct) / 100
  const toCrypto = baseToConvert > 0 ? baseToConvert : 0
  const hasSplit = split && Object.values(split).some(v => Number(v) > 0)
  const entries = Object.entries(split || {}).filter(([, pct]) => Number(pct) > 0)
  return (
    <div className="mt-4 p-3 rounded bg-gray-50 dark:bg-slate-800/40">
      <div className="subtitle mb-2">Last payday</div>
      <div className="text-sm grid md:grid-cols-2 gap-3">
        <div>
          <div className="text-gray-500">Net</div>
          <div className="font-semibold">{net > 0 ? `${net.toFixed(2)} ${fiat}` : '—'}</div>
        </div>
        <div>
          <div className="text-gray-500">To convert {convertMode === 'fixed' ? '' : `(${percent || 0}%)`}</div>
          <div className="font-semibold">{toCrypto.toFixed(2)} {fiat}</div>
        </div>
      </div>
      <div className="mt-3">
        <div className="text-sm text-gray-600 dark:text-slate-300 mb-1">Breakdown by crypto (with current rate)</div>
        {(!hasSplit || toCrypto <= 0) ? (
          <div className="text-xs text-gray-500">No split configured or nothing to convert.</div>
        ) : (
          <div className="space-y-1">
            {entries.map(([sym, pct]) => {
              const rate = Number(prices?.[sym] || 0)
              const fiatAmt = toCrypto * Number(pct) / 100
              const cryptoAmt = rate > 0 ? (fiatAmt / rate) : 0
              return (
                <div key={sym} className="flex justify-between text-sm">
                  <div>{sym} • {pct}% @ {rate ? `${rate.toFixed(2)} ${fiat}/${sym}` : 'rate N/A'}</div>
                  <div className="font-medium">{fiatAmt.toFixed(2)} {fiat} ≈ {cryptoAmt.toFixed(6)} {sym}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function UserInfoCard({ employee, fiat='CAD' }) {
  if (!employee) return null
  const name = [employee.first_name, employee.last_name].filter(Boolean).join(' ').trim()
  const displayName = name || employee.user_id
  const address = employee.address || 'No address on file'
  const net = resolveNetSalary(employee)
  const salaryDisplay = (value) => value > 0 ? `${value.toFixed(2)} ${fiat}` : 'Not provided'
  return (
    <div className="card p-4">
      <div className="title mb-2">User info</div>
      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-gray-500">Name</div>
          <div className="font-semibold">{displayName}</div>
        </div>
        <div>
          <div className="text-gray-500">User ID</div>
          <div className="font-mono text-xs md:text-sm break-all">{employee.user_id}</div>
        </div>
        <div>
          <div className="text-gray-500">Net salary (per pay)</div>
          <div className="font-semibold">{salaryDisplay(net)}</div>
        </div>
        <div className="md:col-span-3">
          <div className="text-gray-500">Address</div>
          <div className="text-sm">{address}</div>
        </div>
      </div>
    </div>
  )
}

export default function EmployeePage() {
  const [userId, setUserId] = useState('')
  const [percent, setPercent] = useState(0)
  const [convertMode, setConvertMode] = useState('percent') // 'percent' | 'fixed'
  const [fixedAmount, setFixedAmount] = useState(0)
  const [addresses, setAddresses] = useState({})
  const [cryptoSplit, setCryptoSplit] = useState({})
  const [employees, setEmployees] = useState([])
  const [prices, setPrices] = useState({})
  const [fiat, setFiat] = useState('CAD')
  const [supported, setSupported] = useState({ cryptos: [], fiats: [] })
  const [addressesSaved, setAddressesSaved] = useState(false)
  const [addrValid, setAddrValid] = useState(true)
  const [mode, setMode] = useState('existing') // 'existing' | 'new'
  const [newUserId, setNewUserId] = useState('')
  const [txs, setTxs] = useState([])

  const employee = useMemo(() => employees.find(e => e.user_id === userId), [employees, userId])

  useEffect(() => {
    getSupported().then(setSupported)
  }, [])

  useEffect(() => {
    listEmployees().then(list => {
      setEmployees(list)
      if (list.length === 0) {
        setMode('new')
      } else if (!userId) {
        setUserId(list[0].user_id)
        setMode('existing')
      }
    })
    getPrices(fiat).then(res => setPrices(res.prices))
    listTransactions().then(setTxs)
  }, [fiat])

  // Listen for global sync event to refresh employees and select the new one
  useEffect(() => {
    const onSynced = (e) => {
      listEmployees().then(list => {
        setEmployees(list)
        const newUser = e?.detail
        if (newUser?.user_id) {
          setUserId(newUser.user_id)
          setMode('existing')
        }
      })
    }
    window.addEventListener('users:synced', onSynced)
    return () => window.removeEventListener('users:synced', onSynced)
  }, [])

  useEffect(() => {
    if (employee) {
      setPercent(employee.percent_to_crypto)
      setConvertMode(employee.convert_mode || 'percent')
      setFixedAmount(Number(employee.fixed_amount_fiat || 0))
      setAddresses(employee.receiving_addresses)
      setCryptoSplit(employee.crypto_split || {})
      // assume existing addresses in backend are valid and saved
      setAddressesSaved(true)
      setAddrValid(true)
    } else {
      // creating a new user or a non-existing one
      setPercent(0)
      setConvertMode('percent')
      setFixedAmount(0)
      setAddresses({})
      setCryptoSplit({})
      setAddressesSaved(false)
      setAddrValid(true)
    }
  }, [employee?.user_id])

  const save = async () => {
    const payload = {
      user_id: userId,
      percent_to_crypto: percent,
      convert_mode: convertMode,
      fixed_amount_fiat: Number(fixedAmount || 0),
      receiving_addresses: addresses,
      crypto_split: cryptoSplit,
    }
    await upsertEmployee(payload)
    const list = await listEmployees()
    setEmployees(list)
    if (mode === 'new' && !list.find(e => e.user_id === userId)) {
      // ensure it shows under existing after creation
      setMode('existing')
    }
  }

  const btcBalance = employee?.accumulated_crypto?.BTC || 0
  const btcPrice = prices?.BTC || 0

  // Derive transactions assigned to this employee
  const assignedTxs = useMemo(() => getEmployeeTransactions(employee, txs, prices), [employee, txs, prices])

  // Compute average acquisition cost for BTC from assigned transactions
  const { btcAvgCost, btcAvgFiat } = useMemo(() => {
    const btcTxs = assignedTxs.filter(t => t.crypto_symbol === 'BTC')
    const totals = btcTxs.reduce((acc, t) => {
      acc.crypto += (t.crypto_amount || 0)
      acc.fiat += (t.value_at_tx || 0)
      acc.fiatCurrency = t.fiat_currency || acc.fiatCurrency
      return acc
    }, { crypto: 0, fiat: 0, fiatCurrency: fiat })
    const avg = totals.crypto > 0 ? (totals.fiat / totals.crypto) : 0
    return { btcAvgCost: avg, btcAvgFiat: totals.fiatCurrency }
  }, [assignedTxs, fiat])

  const btcSub = useMemo(() => {
    const currentVal = (btcBalance * btcPrice).toFixed(2)
    const avgText = btcAvgCost > 0 ? ` • Avg cost: ${btcAvgCost.toFixed(2)} ${btcAvgFiat}/BTC` : ''
    return `≈ ${currentVal} ${fiat}${avgText}`
  }, [btcBalance, btcPrice, fiat, btcAvgCost, btcAvgFiat])

  const saveDisabled = !addressesSaved || !addrValid || !userId

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="label">User</div>
          {mode === 'existing' ? (
            <div className="flex items-center gap-2">
              <select
                className="input"
                value={userId || ''}
                onChange={e => {
                  const val = e.target.value
                  if (val === '__new__') {
                    setMode('new')
                    setNewUserId('')
                    setUserId('')
                  } else {
                    setUserId(val)
                  }
                }}
              >
                {employees.length === 0 && <option value="">No employees yet</option>}
                {employees.map(e => (
                  <option key={e.user_id} value={e.user_id}>{e.user_id}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <input
                className="input"
                placeholder="Enter new user ID"
                value={newUserId}
                onChange={e => {
                  setNewUserId(e.target.value)
                  setUserId(e.target.value)
                }}
              />
              <button className="btn btn-secondary" onClick={() => setMode('existing')}>Select existing</button>
            </div>
          )}
        </div>
        <div>
          <div className="label">Fiat currency</div>
          <select className="input" value={fiat} onChange={e => setFiat(e.target.value)}>
            {supported.fiats?.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      {/* User info card shown above the crypto percentage selector */}
      <UserInfoCard employee={employee} fiat={fiat} />

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 card p-4">
          <div className="title mb-2">Choose how much of each paycheck goes to crypto</div>

          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="convert-mode" value="percent" checked={convertMode==='percent'} onChange={()=>setConvertMode('percent')} />
              <span>Percent of net pay</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="convert-mode" value="fixed" checked={convertMode==='fixed'} onChange={()=>setConvertMode('fixed')} />
              <span>Fixed amount per pay ({fiat})</span>
            </label>
          </div>

          {convertMode === 'percent' ? (
            <>
              <Slider value={percent} onChange={setPercent} />
              <div className="text-sm text-gray-600 mt-2">This percentage will be converted and sent to your selected crypto address(es).</div>
            </>
          ) : (
            <div className="flex items-end gap-3">
              <div>
                <div className="label">Amount to convert each pay</div>
                <input type="number" min="0" step="0.01" className="input" value={fixedAmount}
                       onChange={e=> setFixedAmount(e.target.value)} placeholder={`0.00 ${fiat}`} />
              </div>
            </div>
          )}

          <LastPayday
            employee={employee}
            fiat={fiat}
            prices={prices}
            percent={percent}
            split={cryptoSplit}
            convertMode={convertMode}
            fixedAmount={fixedAmount}
          />
        </div>
        <MetricCard label={`Accumulated BTC`} value={`${btcBalance.toFixed(6)} BTC`} sub={btcSub} />
      </div>

      <div className="card p-4">
        <div className="title mb-3">Your deposit addresses</div>
        <AddressForm
          symbols={supported.cryptos}
          initial={addresses}
          initialSplit={cryptoSplit}
          onChange={(addrMap, splitMap, ok) => { setAddresses(addrMap); setCryptoSplit(splitMap); setAddressesSaved(false); setAddrValid(ok) }}
          onSave={(addrMap, splitMap, ok) => { setAddresses(addrMap); setCryptoSplit(splitMap); setAddressesSaved(ok); setAddrValid(ok) }}
        />
        <div className="mt-4 flex items-center gap-3">
          <button className="btn btn-primary" onClick={save} disabled={saveDisabled}>Save profile</button>
          {!addressesSaved && <span className="text-xs text-gray-500 dark:text-slate-400">Save addresses first</span>}
        </div>
      </div>

      <div className="text-xs text-gray-500">Note: Company doesn’t custody funds if your crypto address is provided.</div>

      <div className="card p-4">
        <div className="title mb-2">Your crypto transactions</div>
        <div className="text-sm text-gray-600 mb-3">Shows your share per payroll: amount received, value at the moment of payout, and current value.</div>
        <div className="overflow-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Value at payout</th>
                <th>Current value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assignedTxs.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.date).toLocaleString()}</td>
                  <td>{t.crypto_symbol}</td>
                  <td>{t.crypto_amount.toFixed(6)} {t.crypto_symbol}</td>
                  <td>{t.value_at_tx.toFixed(2)} {t.fiat_currency} @ {t.price_at_tx.toFixed(2)}</td>
                  <td>{t.current_value.toFixed(2)} {t.fiat_currency}</td>
                  <td className="text-xs"><span className={`badge ${t.status==='confirmed'?'badge-green':'badge-yellow'}`}>{t.status}</span></td>
                </tr>
              ))}
              {assignedTxs.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-gray-500" colSpan={6}>No transactions for this user yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
