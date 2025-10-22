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

export default function AddressForm({ symbols = ['BTC','ETH','USDT','USDC'], initial = {}, onSave, onChange = () => {} }) {
  const [form, setForm] = useState(() => {
    const f = {}
    symbols.forEach(s => { f[s] = initial?.[s] || '' })
    return f
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    // keep in sync if initial changes from parent
    const f = {}
    symbols.forEach(s => { f[s] = initial?.[s] || '' })
    setForm(f)
    setErrors({})
  }, [symbols.join(','), JSON.stringify(initial)])

  const validity = useMemo(() => {
    const errs = {}
    let okAll = true
    symbols.forEach(s => {
      const res = validate(s, form[s])
      if (!res.ok) {
        errs[s] = res.msg
        okAll = false
      }
    })
    return { ok: okAll, errs }
  }, [form, symbols])

  const handleChange = (s, v) => {
    setForm(prev => {
      const next = { ...prev, [s]: v }
      const res = validate(s, v)
      setErrors(prevErrs => ({ ...prevErrs, [s]: res.ok ? undefined : res.msg }))
      // notify parent about change and overall validity
      const nextValidity = symbols.every(sym => validate(sym, sym === s ? v : prev[sym]).ok)
      onChange(next, nextValidity)
      return next
    })
  }

  const handleSave = () => {
    const { ok, errs } = validity
    if (!ok) {
      setErrors(errs)
      return onSave?.(form, false)
    }
    setErrors({})
    onSave?.(form, true)
  }

  return (
    <div className="space-y-3">
      {symbols.map(sym => (
        <div key={sym}>
          <div className="label">{sym} address</div>
          <input
            className={`input ${errors[sym] ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
            placeholder={`Enter ${sym} address (optional)`}
            value={form[sym]}
            onChange={e => handleChange(sym, e.target.value)}
          />
          {errors[sym] ? <div className="text-xs text-red-600 mt-1">{errors[sym]}</div> : null}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={handleSave}>Save Addresses</button>
        {!validity.ok && <span className="text-xs text-red-600">Please fix invalid addresses</span>}
      </div>
    </div>
  )
}
