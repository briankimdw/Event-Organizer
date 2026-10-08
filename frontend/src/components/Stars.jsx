import { Star } from 'lucide-react'

export default function Stars({ value, size = 14, onChange }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= Math.round(value)
        return (
          <Star
            key={n}
            size={size}
            className={on ? 'on' : ''}
            fill={on ? 'currentColor' : 'none'}
            onClick={onChange ? () => onChange(n) : undefined}
            style={onChange ? { cursor: 'pointer' } : undefined}
          />
        )
      })}
    </span>
  )
}
