import React, { useEffect, useMemo, useState } from 'react'

function validate(sym, val) {
  if (!val) return { ok: true, msg: '' } // optional
  const v = val.trim()
  if (sym === 'BTC') {
    const re = /^(bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/
    return re.test(v) ? { ok: true, msg: '' } : { ok: false, msg: 'Invalid BTC address' }
  }
  // ETH-like (also accept for USDT/USDC for MVP)
  const ethLike = /^0x[a-fA-F0-9]{40}$/
  if (['ETH', 'USDT', 'USDC'].includes(sym)) {
    return ethLike.test(v) ? { ok: true, msg: '' } : { ok: false, msg: `Invalid ${sym} address (expected 0x...)` }
  }
  return { ok: true, msg: '' }
}

// Row-based dynamic form: user adds a row, selects currency, enters address
export default function AddressForm({ symbols = ['BTC','ETH','USDT','USDC'], initial = {}, initialSplit = {}, onSave, onChange = () => {} }) {
  const emptyRow = { sym: symbols[0] || 'BTC', addr: '', pct: 0 }
  const rowsFromInitial = () => {
    const entries = Object.entries(initial || {}).filter(([, v]) => !!v)
    if (entries.length === 0) return [ { ...emptyRow } ]
    return entries.map(([sym, addr]) => ({ sym, addr, pct: Number(initialSplit?.[sym] ?? 0) }))
  }
  const [rows, setRows] = useState(rowsFromInitial)
  const [errors, setErrors] = useState([])

  // build map for parent
  const toMaps = (rws) => {
    const addrMap = {}
    const splitMap = {}
    symbols.forEach(s => { addrMap[s] = ''; splitMap[s] = 0 })
    rws.forEach(r => {
      const hasAddr = r.addr?.trim()
      if (hasAddr) {
        addrMap[r.sym] = r.addr.trim()
        splitMap[r.sym] = Math.max(0, Math.min(100, Number(r.pct || 0)))
      }
    })
    return { addrMap, splitMap }
  }

  // sync when initial/symbols change
  useEffect(() => {
    setRows(rowsFromInitial())
    setErrors([])
  }, [symbols.join(','), JSON.stringify(initial), JSON.stringify(initialSplit)])

  const validity = useMemo(() => {
    const errs = rows.map(r => {
      const res = validate(r.sym, r.addr)
      return res.ok ? '' : res.msg
    })
    const anyAddr = rows.some(r => (r.addr || '').trim())
    const totalPct = rows.filter(r => (r.addr || '').trim()).reduce((acc, r) => acc + Number(r.pct || 0), 0)
    const splitOk = !anyAddr || totalPct === 100
    const okAll = errs.every(e => !e) && splitOk
    return { ok: okAll, errs, splitOk, totalPct }
  }, [rows])

  const emitChange = (nextRows) => {
    const errs = nextRows.map(r => {
      const res = validate(r.sym, r.addr)
      return res.ok ? '' : res.msg
    })
    const anyAddr = nextRows.some(r => (r.addr || '').trim())
    const totalPct = nextRows.filter(r => (r.addr || '').trim()).reduce((acc, r) => acc + Number(r.pct || 0), 0)
    const splitOk = !anyAddr || totalPct === 100
    const okAll = errs.every(e => !e) && splitOk
    const { addrMap, splitMap } = toMaps(nextRows)
    onChange(addrMap, splitMap, okAll)
  }

  const updateRow = (idx, patch) => {
    setRows(prev => {
      const next = prev.map((r, i) => i === idx ? { ...r, ...patch } : r)
      // update error for that row
      const v = validate(next[idx].sym, next[idx].addr)
      setErrors(prevErrs => {
        const e = [...(prevErrs || [])]
        e[idx] = v.ok ? '' : v.msg
        return e
      })
      emitChange(next)
      return next
    })
  }

  const addRow = () => {
    setRows(prev => {
      const next = [...prev, { ...emptyRow }]
      emitChange(next)
      return next
    })
  }

  const removeRow = (idx) => {
    setRows(prev => {
      const next = prev.filter((_, i) => i !== idx)
      if (next.length === 0) next.push({ ...emptyRow })
      emitChange(next)
      return next
    })
  }

  const handleSave = () => {
    const { ok, errs } = validity
    if (!ok) {
      setErrors(errs)
      const { addrMap, splitMap } = toMaps(rows)
      return onSave?.(addrMap, splitMap, false)
    }
    setErrors([])
    const { addrMap, splitMap } = toMaps(rows)
    onSave?.(addrMap, splitMap, true)
  }

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <div className="w-36">
            <div className="label">Currency</div>
            <select className="input" value={row.sym} onChange={e => updateRow(idx, { sym: e.target.value })}>
              {symbols.map(s => {
                const used = rows.some((r, i) => i !== idx && r.sym === s && (r.addr||'').trim())
                return <option key={s} value={s} disabled={used}>{s}{used?' (used)':''}</option>
              })}
            </select>
          </div>
          <div className="flex-1">
            <div className="label">Address</div>
            <input
              className={`input ${errors[idx] ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
              placeholder={`Enter ${row.sym} address (optional)`}
              value={row.addr}
              onChange={e => updateRow(idx, { addr: e.target.value })}
            />
            {errors[idx] ? <div className="text-xs text-red-600 mt-1">{errors[idx]}</div> : null}
          </div>
          <div className="w-32">
            <div className="label">Share %</div>
            <input
              type="number"
              className="input"
              min={0}
              max={100}
              value={row.pct}
              onChange={e => updateRow(idx, { pct: e.target.valueAsNumber ?? Number(e.target.value || 0) })}
            />
          </div>
          <div className="pt-6">
            <button className="btn btn-secondary" onClick={() => removeRow(idx)}>Remove</button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button className="btn btn-secondary" onClick={addRow}>+ Add address</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Addresses</button>
        {!validity.ok && <span className="text-xs text-red-600">{!validity.splitOk ? `Split must total 100% (currently ${validity.totalPct}%)` : 'Please fix invalid addresses'}</span>}
      </div>
      <div className="text-xs text-gray-500">Tip: Only rows with an address are counted. Their Share % must add up to 100%.</div>
    </div>
  )
}
