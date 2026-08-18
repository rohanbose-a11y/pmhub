import { useState } from 'react'
import type { Task } from '../types/task.types'

const selectClass =
  'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 ' +
  'focus:border-indigo-400 transition-all appearance-none pr-9 max-w-full'

interface DependentTasksPickerProps {
  tasks: Task[]
  value: string[]
  onChange: (ids: string[]) => void
  /** Task ID to exclude from the picker (prevents self-reference in EditTaskForm) */
  excludeId?: string
}

export function DependentTasksPicker({ tasks, value, onChange, excludeId }: DependentTasksPickerProps) {
  const [pickerValue, setPickerValue] = useState('')

  const available = tasks.filter((t) => (!excludeId || t.id !== excludeId) && !value.includes(t.id))

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3.5">
          <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 5v3M8 11v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <p className="text-xs text-slate-400">No dependent tasks</p>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
          {value.map((depId) => {
            const depTask = tasks.find((t) => t.id === depId)
            return (
              <div key={depId} className="flex items-center gap-2.5 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-700 font-medium flex-1 min-w-0 truncate">
                  {depTask?.subject ?? depId}
                </span>
                <button
                  aria-label="Remove dependent task"
                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-rose-100 text-slate-400 hover:text-rose-500 transition-colors"
                  onClick={() => onChange(value.filter((x) => x !== depId))}
                  type="button"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <select
            className={selectClass}
            onChange={(e) => setPickerValue(e.target.value)}
            value={pickerValue}
          >
            <option value="">Add a dependent task…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>{t.subject}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 16 16">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <button
          className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
          disabled={!pickerValue}
          onClick={() => {
            if (pickerValue) {
              onChange([...value, pickerValue])
              setPickerValue('')
            }
          }}
          type="button"
        >
          Add
        </button>
      </div>
    </div>
  )
}
