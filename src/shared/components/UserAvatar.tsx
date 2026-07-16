import { formatUserDisplay } from '../lib/formatUserDisplay'

/** Colour palettes — index chosen by hashing the username so the same person always gets the same colour */
const PALETTES = [
  { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200' },
  { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' },
  { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
] as const

function nameToIndex(name: string): number {
  let h = 5381
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h) ^ name.charCodeAt(i)
  }
  return Math.abs(h) % PALETTES.length
}

/** "Jane Doe" → "JD"   |   "alice@co.com" → "A" */
function buildInitials(fullName?: string | null, fallback?: string): string {
  const src = fullName?.trim()
  if (src) {
    return src.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  }
  return (fallback ?? '?').charAt(0).toUpperCase()
}

const SIZES = {
  xs: { wrap: 'w-5 h-5', font: 'text-[9px]' },
  sm: { wrap: 'w-7 h-7', font: 'text-xs' },
  md: { wrap: 'w-8 h-8', font: 'text-sm' },
  lg: { wrap: 'w-14 h-14', font: 'text-xl' },
} as const

export interface UserAvatarProps {
  /** Username / email — drives the colour */
  name: string
  /** Full display name — used for 1-2 letter initials */
  fullName?: string | null
  size?: keyof typeof SIZES
  shape?: 'circle' | 'square'
  className?: string
}

export function UserAvatar({
  name,
  fullName,
  size = 'sm',
  shape = 'circle',
  className = '',
}: UserAvatarProps) {
  const palette = PALETTES[nameToIndex(name)]
  const initials = buildInitials(fullName, name)
  const { wrap, font } = SIZES[size]
  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl'

  return (
    <div
      className={`${wrap} ${shapeClass} ${palette.bg} border ${palette.border} flex items-center justify-center flex-shrink-0 ${className}`}
      title={fullName ?? name}
    >
      <span className={`${font} font-bold ${palette.text} leading-none select-none`}>
        {initials}
      </span>
    </div>
  )
}

/** Overlapping row of avatars. Shows up to `max`, then "+N" overflow badge. */
export interface AvatarStackProps {
  userIds: string[]
  max?: number
}

export function AvatarStack({ userIds, max = 3 }: AvatarStackProps) {
  if (userIds.length === 0) return null
  const visible = userIds.slice(0, max)
  const overflow = userIds.length - visible.length

  return (
    <div className="flex items-center" title={userIds.map(formatUserDisplay).join(', ')}>
      {visible.map((uid, i) => (
        <UserAvatar
          key={uid}
          className={i > 0 ? '-ml-2 ring-[2px] ring-white' : 'ring-[2px] ring-white'}
          fullName={formatUserDisplay(uid)}
          name={uid}
          size="xs"
        />
      ))}
      {overflow > 0 && (
        <div className="-ml-2 w-5 h-5 rounded-full bg-slate-100 border border-slate-200 ring-[2px] ring-white flex items-center justify-center flex-shrink-0">
          <span className="text-[9px] font-bold text-slate-500 leading-none">+{overflow}</span>
        </div>
      )}
    </div>
  )
}
