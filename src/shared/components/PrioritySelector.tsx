const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const

const ACTIVE_CLASSES: Record<string, string> = {
  Urgent: 'bg-rose-600 border-rose-600 text-white shadow-sm',
  High:   'bg-orange-500 border-orange-500 text-white shadow-sm',
  Medium: 'bg-amber-500 border-amber-500 text-white shadow-sm',
  Low:    'bg-slate-500 border-slate-500 text-white shadow-sm',
}

interface PrioritySelectorProps {
  value: string
  onChange: (priority: string) => void
  disabled?: boolean
}

export function PrioritySelector({ value, onChange, disabled = false }: PrioritySelectorProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {PRIORITIES.map((p) => (
        <button
          key={p}
          type="button"
          disabled={disabled}
          onClick={() => onChange(p)}
          className={[
            'py-2.5 rounded-lg text-xs font-semibold border transition-all',
            value === p
              ? (ACTIVE_CLASSES[p] ?? 'bg-slate-500 border-slate-500 text-white shadow-sm')
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100',
          ].join(' ')}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
