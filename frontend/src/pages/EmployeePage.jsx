import React, { useEffect, useMemo, useState } from 'react'
import Slider from '../components/Slider.jsx'
import AddressForm from '../components/AddressForm.jsx'
import MetricCard from '../components/MetricCard.jsx'
import { getPrices, listEmployees, upsertEmployee, getSupported } from '../services/api.js'

function LastPayday({ fiat, prices, percent, split }) {
  // MVP assumptions for last payday values
  const gross = 5000
  const net = 4000
  const toCrypto = (net * (percent || 0)) / 100
  const hasSplit = split && Object.values(split).some(v => Number(v) > 0)
  const entries = Object.entries(split || {}).filter(([, pct]) => Number(pct) > 0)
  return (
    <div className="mt-4 p-3 rounded bg-gray-50 dark:bg-slate-800/40">
      <div className="subtitle mb-2">Last payday</div>
      <div className="text-sm grid md:grid-cols-3 gap-3">
        <div>
          <div className="text-gray-500">Gross</div>
          <div className="font-semibold">{gross.toFixed(2)} {fiat}</div>
        </div>
        <div>
          <div className="text-gray-500">Net</div>
          <div className="font-semibold">{net.toFixed(2)} {fiat}</div>
        </div>
        <div>
          <div className="text-gray-500">To convert ({percent || 0}%)</div>
          <div className="font-semibold">{toCrypto.toFixed(2)} {fiat}</div>
        </div>
      </div>
      <div className="mt-3">
        <div className="text-sm text-gray-600 dark:text-slate-300 mb-1">Breakdown by crypto (with current rate)</div>
        {(!hasSplit || toCrypto <= 0) ? (
          <div className="text-xs text-gray-500">No split configured or 0% to crypto.</div>
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

function UserInfoCard({ employee }) {
  if (!employee) return null
  const name = [employee.first_name, employee.last_name].filter(Boolean).join(' ').trim()
  const displayName = name || employee.user_id
  const address = employee.address || 'No address on file'
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
        <div className="md:col-span-1">
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
  const [addresses, setAddresses] = useState({})
  const [cryptoSplit, setCryptoSplit] = useState({})
  const [employees, setEmployees] = useState([])
  const [prices, setPrices] = useState({})
  const [fiat, setFiat] = useState('USD')
  const [supported, setSupported] = useState({ cryptos: [], fiats: [] })
  const [addressesSaved, setAddressesSaved] = useState(false)
  const [addrValid, setAddrValid] = useState(true)
  const [mode, setMode] = useState('existing') // 'existing' | 'new'
  const [newUserId, setNewUserId] = useState('')
  const [loadingEmployees, setLoadingEmployees] = useState(true)

  const employee = useMemo(() => employees.find(e => e.user_id === userId), [employees, userId])

  useEffect(() => {
    getSupported().then(setSupported)
  }, [])

  const fetchEmployees = async () => {
    setLoadingEmployees(true)
    try {
      const list = await listEmployees()
      setEmployees(list)
      if (list.length === 0) {
        setMode('new')
      } else if (!userId) {
        setUserId(list[0].user_id)
        setMode('existing')
      }
    } finally {
      setLoadingEmployees(false)
    }
  }

  useEffect(() => {
    fetchEmployees()
    getPrices(fiat).then(res => setPrices(res.prices))
  }, [fiat])

  // Refetch on window focus/visibility to avoid stale state when navigating back
  useEffect(() => {
    const onFocus = () => fetchEmployees()
    const onVis = () => { if (document.visibilityState === 'visible') fetchEmployees() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

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
      setAddresses(employee.receiving_addresses)
      setCryptoSplit(employee.crypto_split || {})
      // assume existing addresses in backend are valid and saved
      setAddressesSaved(true)
      setAddrValid(true)
    } else {
      // creating a new user or a non-existing one
      setPercent(0)
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
                {loadingEmployees && <option value="" disabled>Loading employees…</option>}
                {!loadingEmployees && employees.length === 0 && <option value="" disabled>No employees yet</option>}
                {!loadingEmployees && employees.map(e => (
                  <option key={e.user_id} value={e.user_id}>{e.user_id}</option>
                ))}
                <option value="__new__">+ Create new user…</option>
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
      <UserInfoCard employee={employee} />

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 card p-4">
          <div className="title mb-2">Choose how much of each paycheck goes to crypto</div>
          <Slider value={percent} onChange={setPercent} />
          <div className="text-sm text-gray-600 mt-2">This percentage will be converted and sent to your selected crypto address(es).</div>
          <LastPayday
            fiat={fiat}
            prices={prices}
            percent={percent}
            split={cryptoSplit}
          />
        </div>
        <MetricCard label={`Accumulated BTC`} value={`${btcBalance.toFixed(6)} BTC`} sub={`≈ ${(btcBalance * btcPrice).toFixed(2)} ${fiat}`} />
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
    </div>
  )
}
