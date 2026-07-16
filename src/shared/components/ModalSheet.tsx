import { useEffect, type ReactNode } from 'react'

interface ModalSheetProps {
  isOpen: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}

export function ModalSheet({ isOpen, title, description, onClose, children }: ModalSheetProps) {
  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      aria-labelledby="modal-sheet-title"
      aria-modal="true"
      className="fixed inset-0 bg-black/50 flex items-end justify-center md:items-center z-50 animate-fade-in p-0 md:p-6"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md md:max-w-2xl shadow-modal animate-slide-up flex flex-col"
        style={{ maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="flex-shrink-0 px-5 pt-4 pb-3.5 border-b border-slate-200">
          <div className="w-8 h-1 bg-slate-200 rounded-full mx-auto mb-4 md:hidden" />
          <div className="flex justify-between items-start">
            <div>
              <h2 id="modal-sheet-title" className="text-base font-semibold text-slate-900">
                {title}
              </h2>
              {description ? (
                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[240px]">{description}</p>
              ) : null}
            </div>
            <button
              aria-label="Close"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0 ml-3"
              onClick={onClose}
              type="button"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto scrollbar-none px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  )
}
