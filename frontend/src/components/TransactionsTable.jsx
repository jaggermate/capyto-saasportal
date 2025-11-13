import React from 'react'

const statusTone = {
  confirmed: 'badge-green',
  pending: 'badge-yellow',
}

const shortHash = hash => `${hash.slice(0, 8)}…${hash.slice(-4)}`

export default function TransactionsTable({ items = [], onSelect, emptyMessage = 'No transactions yet.' }) {
  return (
    <div className="card overflow-hidden">
      <table className="table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Batch</th>
            <th>Crypto payout</th>
            <th>Fiat total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map(t => (
            <tr
              key={t.id}
              className={onSelect ? 'cursor-pointer hover:bg-blue-50/60 dark:hover:bg-slate-800/60' : undefined}
              onClick={() => onSelect && onSelect(t)}
            >
              <td>
                <div className="font-medium text-slate-900 dark:text-white">
                  {new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400">
                  {new Date(t.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </td>
              <td>
                <div className="font-medium">{t.num_employees} employees</div>
                <div className="text-xs text-gray-500 dark:text-slate-400 font-mono">
                  {shortHash(t.tx_hash)}
                </div>
              </td>
              <td>
                <div className="font-semibold text-slate-900 dark:text-white">
                  {t.crypto_amount.toFixed(6)} {t.crypto_symbol}
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400">
                  @ {t.price_at_tx.toFixed(2)} {t.fiat_currency}
                </div>
              </td>
              <td>
                <div className="font-semibold">
                  {t.fiat_amount.toLocaleString(undefined, {
                    style: 'currency',
                    currency: t.fiat_currency,
                    minimumFractionDigits: 2,
                  })}
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400">Includes fees + payouts</div>
              </td>
              <td>
                <span className={`badge ${statusTone[t.status] || 'badge-blue'}`}>{t.status}</span>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td className="px-4 py-8 text-center text-sm text-gray-500 dark:text-slate-400" colSpan={5}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
