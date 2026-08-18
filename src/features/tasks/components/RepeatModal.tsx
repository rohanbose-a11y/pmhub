import { useState, useEffect } from 'react'
import { WEEKDAYS } from '../../../api/autoRepeatApi'
import type { AutoRepeat, AutoRepeatInput, RepeatFrequency, Weekday } from '../../../api/autoRepeatApi'

function fmtRepeatDate(d: string) {
  return new Date(d).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
}

function describeRepeatSchedule(freq: RepeatFrequency, days: Weekday[], onDay: string) {
  if (freq === 'Daily') return 'Every day'
  if (freq === 'Weekly') {
    if (days.length === 0) return 'Every week'
    return `Every ${days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}`
  }
  const daySuffix = onDay ? ` on day ${onDay}` : ''
  if (freq === 'Monthly')     return `Every month${daySuffix}`
  if (freq === 'Quarterly')   return `Every quarter${daySuffix}`
  if (freq === 'Half-yearly') return `Every 6 months${daySuffix}`
  return `Every year${daySuffix}`
}

interface RepeatModalProps {
  open: boolean
  onClose: () => void
  savedRepeat: AutoRepeat | null
  defaultStartDate?: string
  /** Parent handles the actual save (API call or local state update). */
  onSave: (input: AutoRepeatInput) => Promise<void>
  /** If provided, a "Remove repeat" button is shown. */
  onRemove?: () => Promise<void>
}

export function RepeatModal({ open, onClose, savedRepeat, defaultStartDate, onSave, onRemove }: RepeatModalProps) {
  const [repeatEnabled, setRepeatEnabled] = useState(false)
  const [freq,      setFreq]      = useState<RepeatFrequency>('Weekly')
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')
  const [onDay,     setOnDay]     = useState('')
  const [weekdays,  setWeekdays]  = useState<Weekday[]>([])
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // Sync form state each time the modal opens
  useEffect(() => {
    if (!open) return
    setError(null)
    if (savedRepeat) {
      setRepeatEnabled(true)
      setFreq(savedRepeat.frequency)
      setStartDate(savedRepeat.startDate)
      setEndDate(savedRepeat.endDate ?? '')
      setOnDay(String(savedRepeat.repeatOnDay ?? ''))
      setWeekdays(savedRepeat.repeatOnWeekdays ?? [])
    } else {
      setRepeatEnabled(false)
      setFreq('Weekly')
      setStartDate(defaultStartDate ?? '')
      setEndDate('')
      setOnDay('')
      setWeekdays([])
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  async function handleSave() {
    if (!startDate) { setError('Start date is required'); return }
    setSaving(true); setError(null)
    try {
      await onSave({
        frequency: freq,
        startDate,
        ...(endDate && { endDate }),
        ...(onDay && { repeatOnDay: parseInt(onDay) }),
        repeatOnWeekdays: weekdays,
      })
      onClose()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!onRemove) return
    setSaving(true); setError(null)
    try {
      await onRemove()
      onClose()
    } catch {
      setError('Failed to remove. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg fill="none" viewBox="0 0 16 16" width="14" height="14" className="text-indigo-500">
              <path d="M1 5h10.5a3 3 0 0 1 0 6H9M1 5l2.5-2.5M1 5l2.5 2.5M15 11H4.5a3 3 0 0 1 0-6H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[13.5px] font-semibold text-slate-700">Repeat Task</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg fill="none" viewBox="0 0 12 12" width="10" height="10">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {error && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 text-rose-700 px-3 py-2.5 rounded-lg text-[12px]">
              <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zm.75 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z"/>
              </svg>
              <span>{error}</span>
            </div>
          )}

          {!repeatEnabled ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center">
                <svg fill="none" viewBox="0 0 20 20" width="18" height="18" className="text-slate-400">
                  <path d="M3 10a7 7 0 0 1 13-3.5M17 10a7 7 0 0 1-13 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  <path d="M16 6.5l1-2 2 1.5M4 13.5l-1 2-2-1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-600">No repeat configured</p>
                <p className="text-[11.5px] text-slate-400 mt-0.5">Set up a recurring schedule for this task</p>
              </div>
              <button
                type="button"
                onClick={() => setRepeatEnabled(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[12.5px] font-medium rounded-lg transition-colors"
              >
                <svg fill="none" viewBox="0 0 12 12" width="11" height="11">
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/>
                </svg>
                Set up repeat
              </button>
            </div>
          ) : (
            /* Form */
            <>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {/* Frequency */}
                <div className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="text-xs font-semibold text-slate-500 w-24 flex-shrink-0">Frequency</span>
                  <select
                    value={freq}
                    onChange={(e) => setFreq(e.target.value as RepeatFrequency)}
                    className="flex-1 text-[12.5px] text-slate-700 bg-transparent outline-none border border-slate-200 rounded-lg px-2.5 py-1.5 appearance-none"
                  >
                    {(['Daily','Weekly','Monthly','Quarterly','Half-yearly','Yearly'] as RepeatFrequency[]).map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                {/* Start date */}
                <div className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="text-xs font-semibold text-slate-500 w-24 flex-shrink-0">Start date</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="flex-1 text-[12.5px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-300"
                  />
                </div>
                {/* End date */}
                <div className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="text-xs font-semibold text-slate-500 w-24 flex-shrink-0">End date</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1 text-[12.5px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-300"
                  />
                </div>
                {/* Weekday picker — weekly only */}
                {freq === 'Weekly' && (
                  <div className="px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-slate-500 block mb-2">Repeat on days</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {WEEKDAYS.map((day) => {
                        const active = weekdays.includes(day)
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => setWeekdays((prev) => active ? prev.filter((d) => d !== day) : [...prev, day])}
                            className={['w-8 h-8 rounded-full text-[11px] font-bold border transition-all',
                              active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-500'].join(' ')}
                          >
                            {day.slice(0, 2).toUpperCase()}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {/* Day of month — monthly+ */}
                {['Monthly','Quarterly','Half-yearly','Yearly'].includes(freq) && (
                  <div className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-slate-500 w-24 flex-shrink-0">Day of month</span>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={onDay}
                      onChange={(e) => setOnDay(e.target.value)}
                      placeholder="1–28"
                      className="w-20 text-[12.5px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                )}
                {/* Preview */}
                <div className="px-3.5 py-2.5 bg-slate-50">
                  <p className="text-[11.5px] text-slate-500">
                    <span className="font-semibold text-slate-600">Preview: </span>
                    {describeRepeatSchedule(freq, weekdays, onDay)}
                    {startDate && ` · from ${fmtRepeatDate(startDate)}`}
                    {endDate && ` · until ${fmtRepeatDate(endDate)}`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[12.5px] font-medium transition-colors"
              >
                {saving ? 'Saving…' : savedRepeat ? 'Update repeat' : 'Save repeat'}
              </button>

              {onRemove && (
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  disabled={saving}
                  className="w-full py-2 rounded-lg border border-rose-200 text-rose-500 text-[12px] font-medium hover:bg-rose-50 disabled:opacity-60 transition-colors"
                >
                  Remove repeat
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
