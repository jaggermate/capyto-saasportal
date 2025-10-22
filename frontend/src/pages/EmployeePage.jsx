import React, { useEffect, useMemo, useState } from 'react'
import Slider from '../components/Slider.jsx'
import AddressForm from '../components/AddressForm.jsx'
import MetricCard from '../components/MetricCard.jsx'
import { getPrices, listEmployees, upsertEmployee, getSupported } from '../services/api.js'

export default function EmployeePage() {
  const [userId, setUserId] = useState('')
  const [percent, setPercent] = useState(0)
  const [addresses, setAddresses] = useState({})
  const [employees, setEmployees] = useState([])
  const [prices, setPrices] = useState({})
  const [fiat, setFiat] = useState('USD')
  const [supported, setSupported] = useState({ cryptos: [], fiats: [] })
  const [addressesSaved, setAddressesSaved] = useState(false)
  const [addrValid, setAddrValid] = useState(true)
  const [mode, setMode] = useState('existing') // 'existing' | 'new'
  const [newUserId, setNewUserId] = useState('')

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
  }, [fiat])

  useEffect(() => {
    if (employee) {
      setPercent(employee.percent_to_crypto)
      setAddresses(employee.receiving_addresses)
      // assume existing addresses in backend are valid and saved
      setAddressesSaved(true)
      setAddrValid(true)
    } else {
      // creating a new user or a non-existing one
      setPercent(0)
      setAddresses({})
      setAddressesSaved(false)
      setAddrValid(true)
    }
  }, [employee?.user_id])

  const save = async () => {
    const payload = {
      user_id: userId,
      percent_to_crypto: percent,
      receiving_addresses: addresses,
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
                {employees.length === 0 && <option value="">No employees yet</option>}
                {employees.map(e => (
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

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 card p-4">
          <div className="title mb-2">Choose how much of each paycheck goes to crypto</div>
          <Slider value={percent} onChange={setPercent} />
          <div className="text-sm text-gray-600 mt-2">This percentage will be converted and sent to your selected crypto address(es).</div>
        </div>
        <MetricCard label={`Accumulated BTC`} value={`${btcBalance.toFixed(6)} BTC`} sub={`≈ ${(btcBalance * btcPrice).toFixed(2)} ${fiat}`} />
      </div>

      <div className="card p-4">
        <div className="title mb-3">Your deposit addresses</div>
        <AddressForm
          symbols={supported.cryptos}
          initial={addresses}
          onChange={(form, valid) => { setAddresses(form); setAddressesSaved(false); setAddrValid(valid) }}
          onSave={(form, valid) => { setAddresses(form); setAddressesSaved(valid); setAddrValid(valid) }}
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
