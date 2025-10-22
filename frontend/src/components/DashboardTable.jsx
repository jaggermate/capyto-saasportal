import React from 'react'

export default function DashboardTable({ employees = [] }) {
  return (
    <div className="card overflow-hidden">
      <table className="table">
        <thead>
          <tr>
            <th>User ID</th>
            <th>% to crypto</th>
            <th>BTC addr</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(e => (
            <tr key={e.user_id}>
              <td>{e.user_id}</td>
              <td><span className="badge badge-blue">{e.percent_to_crypto}%</span></td>
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
