import { useEffect, useRef, useState } from 'react'

interface KraComboboxProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  loading?: boolean
  id?: string
  placeholder?: string
}

export function KraCombobox({
  value,
  onChange,
  options,
  loading = false,
  id,
  placeholder = 'Search or type KRA…',
}: KraComboboxProps) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep query in sync when value changes externally (e.g. form reset)
  useEffect(() => {
    setQuery(value)
  }, [value])

  // Close on click outside
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        // If query doesn't match any option, treat as free-text
        setQuery(query)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [query])

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  const handleSelect = (opt: string) => {
    setQuery(opt)
    onChange(opt)
    setOpen(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    onChange(val) // allow free-text
    setOpen(true)
  }

  const handleClear = () => {
    setQuery('')
    onChange('')
    inputRef.current?.focus()
    setOpen(true)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        {/* Search icon */}
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
          fill="none"
          viewBox="0 0 16 16"
        >
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>

        <input
          ref={inputRef}
          autoComplete="off"
          className="w-full pl-9 pr-9 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 focus:bg-white transition-all"
          disabled={loading}
          id={id}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={loading ? 'Loading KRA list…' : placeholder}
          type="text"
          value={query}
        />

        {/* Clear button */}
        {query && (
          <button
            aria-label="Clear"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
            onClick={handleClear}
            type="button"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && !loading && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
          {filtered.slice(0, 20).map((opt) => (
            <li key={opt}>
              <button
                className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors ${
                  opt === value
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                }`}
                onClick={() => handleSelect(opt)}
                type="button"
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* No results hint */}
      {open && !loading && query.trim() && filtered.length === 0 && (
        <div className="absolute z-50 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg px-3.5 py-3">
          <p className="text-xs text-slate-400">
            No match — <span className="font-semibold text-slate-600">"{query}"</span> will be saved as-is
          </p>
        </div>
      )}
    </div>
  )
}
