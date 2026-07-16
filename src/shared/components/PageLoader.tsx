interface PageLoaderProps {
  label?: string
}

export function PageLoader({ label = 'Loading…' }: PageLoaderProps) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-brand">
          <div
            aria-hidden="true"
            className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin-fast"
          />
        </div>
        <p className="text-sm font-medium text-slate-500" aria-live="polite">{label}</p>
      </div>
    </main>
  )
}
