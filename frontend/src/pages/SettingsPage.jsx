import React, { useEffect, useState } from 'react'
import { getCompany, getSupported, updateCompany } from '../services/api.js'

export default function SettingsPage() {
  const [company, setCompany] = useState({
    custody: false,
    company_wallets: { BTC: '', ETH: '', USDT: '', USDC: '' },
    base_fiat: 'CAD',
    company_benefit_amount: 0,
    banking: { bank_name: '', account_name: '', account_number: '', routing_number_or_iban: '', bank_country: '' },
    integrations: { provider: null, nethris: { api_key: '' }, employeurd: { api_key: '' }, workday: { tenant: '', client_id: '', client_secret: '' } },
  })
  const [supported, setSupported] = useState({ cryptos: [], fiats: [] })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

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

  const refresh = async () => {
    setLoading(true)
    const c = await getCompany()
    setCompany({
      ...c,
      company_benefit_amount: c?.company_benefit_amount ?? 0,
      banking: c?.banking ?? { bank_name: '', account_name: '', account_number: '', routing_number_or_iban: '', bank_country: '' },
      integrations: c?.integrations ?? { provider: null, nethris: { api_key: '' }, employeurd: { api_key: '' }, workday: { tenant: '', client_id: '', client_secret: '' } },
    })
    setLoading(false)
  }

  const saveSettings = async () => {
    setSaving(true)
    const data = await updateCompany(company)
    setCompany(data)
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400">Configure your company defaults, custody mode, and treasury wallets.</p>
      </section>

      <div className="space-y-6">
        <section className="card p-6 space-y-3">
          <h2 className="subtitle">General</h2>
          <div className="grid md:grid-cols-2 gap-4">
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
        </section>

        <section className="card p-6 space-y-3">
          <h2 className="subtitle">Company wallets</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400">Used when custody is enabled. Optional otherwise.</p>
          <div className="grid md:grid-cols-2 gap-3">
            {supported.cryptos?.map(sym => (
              <div key={sym}>
                <div className="label">{sym} wallet</div>
                <input className="input" value={company.company_wallets?.[sym] || ''} onChange={e => setCompany(prev => ({...prev, company_wallets: {...prev.company_wallets, [sym]: e.target.value}}))} placeholder={`Enter ${sym} treasury address`} />
              </div>
            ))}
          </div>
        </section>

        <section className="card p-6 space-y-3">
          <h2 className="subtitle">Banking information</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400">Used for fiat funding and refunds. Stored securely and not shared with employees.</p>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="label">Bank name</div>
              <input
                className="input"
                placeholder="e.g., Bank of Example"
                value={company.banking?.bank_name || ''}
                onChange={e => setCompany(prev => ({ ...prev, banking: { ...prev.banking, bank_name: e.target.value } }))}
              />
            </div>
            <div>
              <div className="label">Account holder name</div>
              <input
                className="input"
                placeholder="Company Inc."
                value={company.banking?.account_name || ''}
                onChange={e => setCompany(prev => ({ ...prev, banking: { ...prev.banking, account_name: e.target.value } }))}
              />
            </div>
            <div>
              <div className="label">Account number</div>
              <input
                className="input"
                placeholder="••••••••"
                value={company.banking?.account_number || ''}
                onChange={e => setCompany(prev => ({ ...prev, banking: { ...prev.banking, account_number: e.target.value } }))}
              />
            </div>
            <div>
              <div className="label">Routing number / IBAN</div>
              <input
                className="input"
                placeholder="Routing number or IBAN"
                value={company.banking?.routing_number_or_iban || ''}
                onChange={e => setCompany(prev => ({ ...prev, banking: { ...prev.banking, routing_number_or_iban: e.target.value } }))}
              />
            </div>
            <div>
              <div className="label">Bank country</div>
              <input
                className="input"
                placeholder="e.g., CA, US, FR"
                value={company.banking?.bank_country || ''}
                onChange={e => setCompany(prev => ({ ...prev, banking: { ...prev.banking, bank_country: e.target.value } }))}
              />
            </div>
          </div>
        </section>

        <section className="card p-6 space-y-3">
          <h2 className="subtitle">Integrations</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400">Connect your HR/payroll system to sync employees automatically.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="label">Provider</div>
              <select
                className="input"
                value={company.integrations?.provider ?? ''}
                onChange={e => {
                  const provider = e.target.value || null
                  setCompany(prev => ({ ...prev, integrations: { ...prev.integrations, provider } }))
                }}
              >
                <option value="">None</option>
                <option value="nethris">Nethris</option>
                <option value="employeurd">EmployeurD</option>
                <option value="workday">Workday</option>
              </select>
            </div>
            {company.integrations?.provider === 'nethris' && (
              <div>
                <div className="label">Nethris API key</div>
                <input
                  className="input"
                  placeholder="Enter Nethris API key"
                  value={company.integrations?.nethris?.api_key || ''}
                  onChange={e => setCompany(prev => ({ ...prev, integrations: { ...prev.integrations, nethris: { ...(prev.integrations?.nethris||{}), api_key: e.target.value } } }))}
                />
              </div>
            )}
            {company.integrations?.provider === 'employeurd' && (
              <div>
                <div className="label">EmployeurD API key</div>
                <input
                  className="input"
                  placeholder="Enter EmployeurD API key"
                  value={company.integrations?.employeurd?.api_key || ''}
                  onChange={e => setCompany(prev => ({ ...prev, integrations: { ...prev.integrations, employeurd: { ...(prev.integrations?.employeurd||{}), api_key: e.target.value } } }))}
                />
              </div>
            )}
            {company.integrations?.provider === 'workday' && (
              <>
                <div>
                  <div className="label">Workday tenant</div>
                  <input
                    className="input"
                    placeholder="Tenant"
                    value={company.integrations?.workday?.tenant || ''}
                    onChange={e => setCompany(prev => ({ ...prev, integrations: { ...prev.integrations, workday: { ...(prev.integrations?.workday||{}), tenant: e.target.value } } }))}
                  />
                </div>
                <div>
                  <div className="label">Workday client ID</div>
                  <input
                    className="input"
                    placeholder="Client ID"
                    value={company.integrations?.workday?.client_id || ''}
                    onChange={e => setCompany(prev => ({ ...prev, integrations: { ...prev.integrations, workday: { ...(prev.integrations?.workday||{}), client_id: e.target.value } } }))}
                  />
                </div>
                <div>
                  <div className="label">Workday client secret</div>
                  <input
                    className="input"
                    placeholder="Client secret"
                    value={company.integrations?.workday?.client_secret || ''}
                    onChange={e => setCompany(prev => ({ ...prev, integrations: { ...prev.integrations, workday: { ...(prev.integrations?.workday||{}), client_secret: e.target.value } } }))}
                  />
                </div>
              </>
            )}
          </div>
        </section>

        <section className="card p-6 space-y-3">
          <h2 className="subtitle">Company contribution</h2>
          <div>
            <div className="label">Company benefit per payroll ({company.base_fiat})</div>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={company.company_benefit_amount ?? 0}
              onChange={e => {
                const val = e.target.value
                setCompany(prev => ({ ...prev, company_benefit_amount: val === '' ? 0 : Number(val) }))
              }}
            />
            <div className="text-xs text-gray-500 mt-1">Converted each run in addition to employee allocations. Requires a wallet for the selected crypto.</div>
          </div>
        </section>

        <div className="pt-2">
          <button className="btn btn-primary" onClick={saveSettings} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
