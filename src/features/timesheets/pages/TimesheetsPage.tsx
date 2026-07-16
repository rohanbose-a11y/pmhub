// Timesheets — Coming Soon

const FEATURES = [
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <circle cx="11" cy="12" r="7" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M11 8.5V12l3 2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
        <path d="M11 3v1.5M7 4.2l.75 1.3M5.2 7l1.3.75" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
      </svg>
    ),
    color: 'bg-blue-50 text-blue-500',
    title: 'One-click time logging',
    desc: 'Start a timer or log hours directly from any task. No context switching, no friction.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <rect x="3" y="4" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M7 9h8M7 12.5h5M7 16h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
        <path d="M14.5 3v2.5M7.5 3v2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
      </svg>
    ),
    color: 'bg-violet-50 text-violet-500',
    title: 'Monthly timesheets',
    desc: 'Auto-generated monthly sheets pre-filled with your task work. Review and submit in seconds.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M4 17V6.5A2.5 2.5 0 016.5 4h9A2.5 2.5 0 0118 6.5V17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M2 17h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M8 9h6M8 12.5h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
      </svg>
    ),
    color: 'bg-emerald-50 text-emerald-500',
    title: 'Billable hours tracking',
    desc: 'Mark time as billable or non-billable per task. Instantly see client-ready totals.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M4 18V8l7-4 7 4v10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <rect x="8.5" y="12" width="5" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M11 10v1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
      </svg>
    ),
    color: 'bg-amber-50 text-amber-500',
    title: 'Team time overview',
    desc: 'Managers see the full team\'s logged hours, workload distribution, and capacity at a glance.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M5 15l4-4 3 3 5-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6"/>
        <rect x="3" y="3" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    color: 'bg-rose-50 text-rose-500',
    title: 'Reports & exports',
    desc: 'Download CSV or PDF reports filtered by project, date, or team member. Sync with payroll.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M11 3l2.5 5 5.5.8-4 3.9.9 5.5L11 15.5 6.1 18.2l.9-5.5L3 8.8l5.5-.8L11 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
    color: 'bg-indigo-50 text-indigo-500',
    title: 'Approval workflow',
    desc: 'Submit timesheets for manager review. Get notified on approval or rejection with comments.',
  },
]

export function TimesheetsPage() {
  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">

      {/* ── Hero ── */}
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-10 text-center">

        {/* Floating icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-200 mb-7">
          <svg fill="none" viewBox="0 0 32 32" width="32" height="32" className="text-white">
            <circle cx="16" cy="18" r="9" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M16 13v5l3.5 2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/>
            <path d="M11.5 5h9M16 3v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
          </svg>
        </div>

        {/* Badge */}
        <div className="mb-4">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[11px] font-bold uppercase tracking-widest">
            ✦ Coming Soon
          </span>
        </div>

        <h1 className="text-[36px] font-extrabold text-slate-900 leading-tight mb-4">
          Smart Time Tracking
        </h1>
        <p className="text-[16px] text-slate-500 leading-relaxed max-w-lg mx-auto mb-3">
          Log hours, track billable time, and get monthly timesheets generated automatically — all synced with your tasks and projects.
        </p>
        <p className="text-[13px] text-slate-400">
          We're building something great. Here's what's coming:
        </p>
      </div>

      {/* ── Feature grid ── */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${f.color}`}>
                {f.icon}
              </div>
              <p className="text-[13.5px] font-semibold text-slate-800 mb-1">{f.title}</p>
              <p className="text-[12px] text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Preview strip */}
        <div className="mt-10 rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-50 bg-slate-50/60">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-300"/>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-300"/>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-300"/>
            <span className="ml-2 text-[12px] text-slate-400 font-medium">Timesheet — June 2026</span>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10.5px] font-semibold border border-amber-100">Draft</span>
          </div>
          <div className="divide-y divide-slate-50">
            {[
              { task: 'ERPNext Module Integration', project: 'Core Platform', hours: '6.5', billable: true },
              { task: 'UI Design Review',           project: 'Design System', hours: '2.0', billable: true },
              { task: 'Team standup & planning',    project: 'Internal',      hours: '1.5', billable: false },
              { task: 'Bug fixes — Task list view', project: 'Core Platform', hours: '3.0', billable: true },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-slate-700 truncate">{row.task}</p>
                  <p className="text-[11px] text-slate-400">{row.project}</p>
                </div>
                <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${row.billable ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {row.billable ? 'Billable' : 'Non-billable'}
                </span>
                <span className="text-[13px] font-semibold text-slate-700 w-10 text-right tabular-nums">{row.hours}h</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-5 py-3 bg-indigo-50/50">
              <span className="text-[12px] font-semibold text-slate-600">Total logged</span>
              <span className="text-[14px] font-bold text-indigo-600 tabular-nums">13.0 hrs</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
