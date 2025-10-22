import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']

export default function PieDistribution({ holdings = {} }) {
  const data = Object.entries(holdings)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }))
  if (data.length === 0) {
    return <div className="text-xs text-gray-500">No holdings</div>
  }
  return (
    <div className="w-full h-48">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={70} innerRadius={30}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
