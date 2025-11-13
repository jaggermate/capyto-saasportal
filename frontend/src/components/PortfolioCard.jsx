import React from 'react'
import PieDistribution from './PieDistribution.jsx'

export default function PortfolioCard({ custody=false, prices = {}, holdings = {} , fiat='CAD'}) {
  const symbols = Object.keys(prices)
  const total = symbols.reduce((sum, s) => sum + (holdings[s] || 0) * (prices[s] || 0), 0)
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="title">Portfolio value</div>
          <div className="subtitle">{custody ? 'Company holds custody' : 'Paid directly to employees'}</div>
        </div>
        <div className="text-2xl font-semibold">{total.toFixed(2)} {fiat}</div>
      </div>
      <div className="mt-4 grid md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <PieDistribution holdings={holdings} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {symbols.map(s => (
          <div key={s} className="p-3 rounded border border-gray-200 dark:border-slate-700 text-sm hover:bg-gray-50/60 dark:hover:bg-slate-800/40 transition-colors">
            <div className="text-gray-600 dark:text-slate-300">{s}</div>
            <div className="font-semibold">{(holdings[s] || 0).toFixed(6)} {s}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">@ {(prices[s]||0).toFixed(2)} {fiat}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
