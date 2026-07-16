import { useEffect, useState } from 'react'

interface StatusChangeModalProps {
  currentStatus: string
  isSubmitting: boolean
  onConfirm: (newStatus: string, note: string) => void
  onCancel: () => void
}

const STATUSES = [
  { key: 'Open',           dot: 'bg-slate-400',   ring: 'ring-slate-300',   bg: 'bg-slate-100',   text: 'text-slate-700'   },
  { key: 'Working',        dot: 'bg-blue-500',    ring: 'ring-blue-300',    bg: 'bg-blue-50',     text: 'text-blue-700'    },
  { key: 'Pending Review', dot: 'bg-amber-500',   ring: 'ring-amber-300',   bg: 'bg-amber-50',    text: 'text-amber-700'   },
  { key: 'Overdue',        dot: 'bg-orange-500',  ring: 'ring-orange-300',  bg: 'bg-orange-50',   text: 'text-orange-700'  },
  { key: 'Completed',      dot: 'bg-emerald-500', ring: 'ring-emerald-300', bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  { key: 'Cancelled',      dot: 'bg-rose-400',    ring: 'ring-rose-300',    bg: 'bg-rose-50',     text: 'text-rose-600'    },
]

export function StatusChangeModal({ currentStatus, isSubmitting, onConfirm, onCancel }: StatusChangeModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [note, setNote] = useState('')
  const trimmed = note.trim()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  const canConfirm = !!selectedStatus && !!trimmed && !isSubmitting

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end justify-center md:items-center z-[60] animate-fade-in md:p-6"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md shadow-modal animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div className="px-5 pt-4 pb-4 border-b border-slate-100">
          <div className="w-8 h-1 bg-slate-200 rounded-full mx-auto mb-4 md:hidden" />
          <h2 className="text-base font-bold text-slate-900">Status update required</h2>
          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 flex-wrap">
            <span>Current:</span>
            <span className="font-semibold text-slate-600">{currentStatus}</span>
            {selectedStatus && (
              <>
                <svg fill="none" viewBox="0 0 16 10" width="14" height="10" className="text-slate-300 flex-shrink-0">
                  <path d="M1 5h12M9 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className={`font-semibold ${STATUSES.find((s) => s.key === selectedStatus)?.text ?? 'text-slate-600'}`}>
                  {selectedStatus}
                </span>
              </>
            )}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">

          {/* Status picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              Select new status
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUSES.filter((s) => s.key !== currentStatus).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSelectedStatus(s.key)}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    selectedStatus === s.key
                      ? `${s.bg} ${s.text} border-transparent ring-2 ${s.ring}`
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                  {s.key}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              What's happening?{' '}
              <span className="text-rose-500">*</span>
            </label>
            <textarea
              autoFocus
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all resize-none"
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe what's happening with this task…"
              rows={3}
              value={note}
            />
          </div>

          <div className="flex gap-3">
            <button
              className="flex-1 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
              disabled={isSubmitting}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="flex-[2] py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
              disabled={!canConfirm}
              onClick={() => canConfirm && onConfirm(selectedStatus, trimmed)}
              type="button"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </span>
              ) : (
                'Update Status'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
