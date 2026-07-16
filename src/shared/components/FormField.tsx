import type { InputHTMLAttributes } from 'react'

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export function FormField({ label, error, hint, id, ...props }: FormFieldProps) {
  const inputId = id ?? props.name

  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium text-slate-600" htmlFor={inputId}>
        {label}
      </label>
      <input
        {...props}
        id={inputId}
        className={`px-3.5 py-2.5 bg-white border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
          error
            ? 'border-rose-300 focus:ring-rose-100 focus:border-rose-400'
            : 'border-slate-200 focus:ring-indigo-100 focus:border-indigo-400'
        }`}
      />
      {hint && !error ? <span className="text-xs text-slate-400">{hint}</span> : null}
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  )
}
