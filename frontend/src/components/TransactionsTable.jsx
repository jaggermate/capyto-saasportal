import React from 'react'

export default function TransactionsTable({ items = [] }) {
  return (
    <div className="card overflow-hidden">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Employees</th>
            <th>Crypto</th>
            <th>Fiat</th>
            <th>Tx hash</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map(t => (
            <tr key={t.id}>
              <td>{new Date(t.date).toLocaleString()}</td>
              <td>{t.num_employees}</td>
              <td>{t.crypto_amount.toFixed(6)} {t.crypto_symbol} @ {t.price_at_tx.toFixed(2)} {t.fiat_currency}</td>
              <td>{t.fiat_amount.toFixed(2)} {t.fiat_currency}</td>
              <td className="text-xs text-blue-600 truncate max-w-xs"><a className="hover:underline" href="#" onClick={(e)=>e.preventDefault()}>{t.tx_hash}</a></td>
              <td className="text-xs"><span className={`badge ${t.status==='confirmed'?'badge-green':'badge-yellow'}`}>{t.status}</span></td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td className="px-4 py-8 text-center text-sm text-gray-500" colSpan={6}>No transactions yet</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
