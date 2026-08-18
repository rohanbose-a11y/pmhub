import { useRef } from 'react'

function fmtDate(v: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(v))
  } catch {
    return v
  }
}

interface InlineDatePickerProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  overdue?: boolean
  className?: string
}

export function InlineDatePicker({
  value,
  onChange,
  placeholder = 'Set',
  overdue = false,
  className = '',
}: InlineDatePickerProps) {
  const ref = useRef<HTMLInputElement>(null)

  return (
    <button
      type="button"
      className={`relative ${className}`}
      onClick={() => ref.current?.showPicker?.() ?? ref.current?.click()}
    >
      {value ? (
        <span className={
          overdue
            ? 'text-red-500 font-medium hover:text-red-600 transition-colors'
            : 'text-slate-700 hover:text-indigo-600 transition-colors'
        }>
          {fmtDate(value)}
        </span>
      ) : (
        <span className="text-slate-300 hover:text-indigo-400 transition-colors">{placeholder}</span>
      )}
      <input
        ref={ref}
        className="sr-only"
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </button>
  )
}
