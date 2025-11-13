import React from 'react'

const formatAmount = (value, fiat) => {
  const num = Number(value || 0)
  const safe = Number.isFinite(num) ? num : 0
  return `${safe.toFixed(2)} ${fiat}`
}

export default function DashboardTable({ employees = [], fiat = 'CAD' }) {
  return (
    <div className="card overflow-hidden">
      <table className="table">
        <thead>
          <tr>
            <th>User ID</th>
            <th>Allocation</th>
            <th>BTC addr</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(e => (
            <tr key={e.user_id}>
              <td>{e.user_id}</td>
              <td>
                {e.convert_mode === 'fixed' ? (
                  <span className="badge badge-purple">{formatAmount(e.fixed_amount_fiat, fiat)} fixed</span>
                ) : (
                  <span className="badge badge-blue">{e.percent_to_crypto}%</span>
                )}
              </td>
              <td className="text-xs text-gray-500 dark:text-slate-400 truncate max-w-xs">{e.receiving_addresses?.BTC || '—'}</td>
            </tr>
          ))}
          {employees.length === 0 && (
            <tr>
              <td className="px-4 py-8 text-center text-sm text-gray-500" colSpan={3}>No employees yet</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
