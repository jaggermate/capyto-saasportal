import React from 'react'

export default function Slider({ value, onChange, min=0, max=100, step=1 }) {
  return (
    <div className="w-full">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-blue-600"
      />
      <div className="flex justify-between text-xs text-gray-500">
        <span>{min}%</span>
        <span>{value}%</span>
        <span>{max}%</span>
      </div>
    </div>
  )
}
