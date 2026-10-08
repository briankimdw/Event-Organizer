export default function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`segmented ${className}`}>
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? o : o.label
        return (
          <button key={val} className={value === val ? 'active' : ''} onClick={() => onChange(val)}>
            {label}
          </button>
        )
      })}
    </div>
  )
}
