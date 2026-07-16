import type { Timesheet } from '../types/timesheet.types'

interface TimesheetsPanelProps {
  timesheets: Timesheet[]
  isLoading: boolean
  onEdit: (timesheet: Timesheet) => void
}

function getStatusBadge(status: string) {
  const s = status.toLowerCase()
  if (s === 'submitted') return 'bg-emerald-50 text-emerald-700'
  if (s === 'draft')     return 'bg-amber-50 text-amber-700'
  if (s === 'cancelled') return 'bg-slate-100 text-slate-400'
  return 'bg-indigo-50 text-indigo-700'
}

export function TimesheetsPanel({ timesheets, isLoading, onEdit }: TimesheetsPanelProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (timesheets.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
        <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24">
            <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M8 3.5v3M16 3.5v3M7.5 10.5h9M7.5 15h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/>
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-600">No timesheets found</p>
        <p className="text-xs text-slate-400 mt-1">Timesheets will appear here when created</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 md:space-y-0 animate-fade-in">
      {timesheets.map((ts) => (
        <article
          className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all p-4"
          key={ts.id}
        >
          {/* Header */}
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10 6v4.5l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-slate-900 font-mono truncate">{ts.id}</h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {ts.employeeName ?? ts.employee ?? 'Current user'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${getStatusBadge(ts.status)}`}>
                {ts.status}
              </span>
              <button
                aria-label="Edit timesheet"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                onClick={() => onEdit(ts)}
                type="button"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14">
                  <path
                    d="M10.586 1.414a2 2 0 0 1 2.828 2.829L5.243 12.414H2v-3.243L10.586 1.414z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Month */}
          {ts.month && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 16 16">
                <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M5 2v2M11 2v2M2 7h12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
              </svg>
              <span className="font-medium">{ts.month}</span>
            </div>
          )}

          {/* Note */}
          {ts.note && (
            <p className="text-xs text-slate-400 mt-2.5 line-clamp-2 leading-relaxed">{ts.note}</p>
          )}
        </article>
      ))}
    </div>
  )
}
