import { useRef } from 'react'

function formatDateShort(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}

interface TimelineProps {
  startDate: string
  dueDate: string
  onStartDateChange: (v: string) => void
  onDueDateChange: (v: string) => void
}

export function Timeline({ startDate, dueDate, onStartDateChange, onDueDateChange }: TimelineProps) {
  const startRef = useRef<HTMLInputElement>(null)
  const dueRef = useRef<HTMLInputElement>(null)

  const now = new Date()
  const start = startDate ? new Date(startDate) : null
  const due = dueDate ? new Date(dueDate) : null

  let elapsed = 0
  let daysLeft: number | null = null
  let isOverdue = false

  if (start && due) {
    const total = due.getTime() - start.getTime()
    elapsed = total > 0
      ? Math.min(Math.max(((now.getTime() - start.getTime()) / total) * 100, 0), 100)
      : 0
  }
  if (due) {
    daysLeft = Math.ceil((due.getTime() - now.getTime()) / 86_400_000)
    isOverdue = daysLeft < 0
  }

  const barColor = isOverdue
    ? 'bg-rose-400'
    : daysLeft !== null && daysLeft <= 3
      ? 'bg-amber-400'
      : 'bg-indigo-500'

  const badgeClass = isOverdue
    ? 'bg-rose-100 text-rose-700 border-rose-200'
    : daysLeft !== null && daysLeft <= 3
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-indigo-50 text-indigo-700 border-indigo-100'

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">

        {/* Start date — tap to edit */}
        <button
          className="text-left group min-w-0"
          onClick={() => startRef.current?.showPicker?.() ?? startRef.current?.click()}
          title="Tap to edit start date"
          type="button"
        >
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Start</p>
          <p className={`text-sm font-bold mt-0.5 transition-colors ${startDate ? 'text-slate-800 group-hover:text-indigo-600' : 'text-slate-400 group-hover:text-indigo-400'}`}>
            {startDate ? formatDateShort(startDate) : '+ Set'}
          </p>
          <input
            ref={startRef}
            className="sr-only"
            onChange={(e) => onStartDateChange(e.target.value)}
            type="date"
            value={startDate}
          />
        </button>

        {/* Status badge */}
        {daysLeft !== null ? (
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex-shrink-0 ${badgeClass}`}>
            {isOverdue
              ? `${Math.abs(daysLeft)}d overdue`
              : daysLeft === 0
                ? 'Due today'
                : `${daysLeft}d left`}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400 flex-shrink-0">No due date</span>
        )}

        {/* Due date — tap to edit */}
        <button
          className="text-right group min-w-0"
          onClick={() => dueRef.current?.showPicker?.() ?? dueRef.current?.click()}
          title="Tap to edit due date"
          type="button"
        >
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Due</p>
          <p className={`text-sm font-bold mt-0.5 transition-colors ${dueDate ? 'text-slate-800 group-hover:text-indigo-600' : 'text-slate-400 group-hover:text-indigo-400'}`}>
            {dueDate ? formatDateShort(dueDate) : '+ Set'}
          </p>
          <input
            ref={dueRef}
            className="sr-only"
            onChange={(e) => onDueDateChange(e.target.value)}
            type="date"
            value={dueDate}
          />
        </button>
      </div>

      {/* Progress bar */}
      {start && due && (
        <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${elapsed}%` }} />
          {elapsed > 0 && elapsed < 100 && (
            <div className="absolute top-0 bottom-0 w-0.5 bg-white/80" style={{ left: `${elapsed}%` }} />
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center hidden md:block">Click a date to edit</p>
      <p className="text-[11px] text-slate-400 text-center md:hidden">Tap a date to edit</p>
    </div>
  )
}
