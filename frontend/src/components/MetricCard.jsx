import React from 'react'

export default function MetricCard({ label, value, sub }) {
  return (
    <div className="card p-4 transition-transform hover:-translate-y-0.5">
      <div className="subtitle">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub ? <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{sub}</div> : null}
    </div>
  )
}
