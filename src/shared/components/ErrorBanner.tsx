interface ErrorBannerProps {
  message: string | null
  className?: string
  /** compact=true uses smaller padding/text for inline use (e.g. inside modals) */
  compact?: boolean
}

export function ErrorBanner({ message, className = '', compact = false }: ErrorBannerProps) {
  if (!message) return null
  return (
    <div
      aria-live="polite"
      role="alert"
      className={[
        'flex items-start bg-rose-50 border border-rose-100 text-rose-700 rounded-lg',
        compact ? 'gap-2 px-3 py-2.5 text-[12px]' : 'gap-2.5 p-3.5',
        className,
      ].join(' ')}
    >
      <svg
        className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} flex-shrink-0 mt-0.5`}
        fill="currentColor"
        viewBox="0 0 16 16"
      >
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zm.75 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z"/>
      </svg>
      <span className={compact ? '' : 'text-sm'}>{message}</span>
    </div>
  )
}
