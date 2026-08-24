import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { userApi } from '../../../api/userApi'
import { useEmployee } from '../../employees/hooks/useEmployee'
import { useAuthStore } from '../../../store/authStore'
import { useWorkStore } from '../../../store/workStore'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avBg(s: string): string {
  const palette = ['#6366f1', '#7c3aed', '#2563eb', '#059669', '#d97706', '#0891b2']
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IcPhone     = () => <svg fill="none" viewBox="0 0 14 14" width="14" height="14"><rect x="3.5" y="1" width="7" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="7" cy="10.5" r="0.75" fill="currentColor"/><path d="M5.5 3h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
const IcGlobe     = () => <svg fill="none" viewBox="0 0 14 14" width="14" height="14"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 1.5C5.5 3.5 5 5.1 5 7s.5 3.5 2 5.5M7 1.5c1.5 2 2 3.6 2 5.5s-.5 3.5-2 5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 7h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
const IcGender    = () => <svg fill="none" viewBox="0 0 14 14" width="14" height="14"><circle cx="6.5" cy="6.5" r="3.5" stroke="currentColor" strokeWidth="1.3"/><path d="M6.5 10v3M4.5 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
const IcCake      = () => <svg fill="none" viewBox="0 0 14 14" width="14" height="14"><path d="M4.5 3.5c0-1 .5-1.5.5-1.5M7 3.5c0-1 .5-1.5.5-1.5M9.5 3.5c0-1 .5-1.5.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><rect x="1.5" y="5.5" width="11" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M4.5 5.5v-2M7 5.5v-2M9.5 5.5v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
const IcBadge     = () => <svg fill="none" viewBox="0 0 14 14" width="14" height="14"><rect x="1.5" y="2.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="4.5" cy="7" r="1.2" stroke="currentColor" strokeWidth="1.2"/><path d="M7 5.5h4M7 7h3M7 8.5h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const IcBriefcase = () => <svg fill="none" viewBox="0 0 14 14" width="14" height="14"><rect x="1.5" y="4.5" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5 4.5V3.5A1.5 1.5 0 0 1 6.5 2h1A1.5 1.5 0 0 1 9 3.5v1" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 8h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div
      className="flex items-center gap-3"
      style={{ padding: '10px 0', borderBottom: '1px solid #F3F4F6' }}
    >
      <span style={{ color: '#C4B5FD', flexShrink: 0, display: 'flex' }}>{icon}</span>
      <span className="flex-1 text-[12px]" style={{ color: '#6B7280' }}>{label}</span>
      <span
        className="text-[12px] font-semibold text-right truncate"
        style={{ color: '#111827', maxWidth: '55%' }}
      >
        {value || '—'}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ProfilePage() {
  const navigate = useNavigate()
  const user     = useAuthStore((s) => s.user)
  const logout   = useAuthStore((s) => s.logout)
  const wsStatus = useWorkStore((s) => s.status)

  const [copied,       setCopied]       = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [imgUrl,       setImgUrl]       = useState<string | null>(null)

  const username    = user?.username ?? ''
  const fullName    = user?.fullName ?? username
  const loginId     = user?.loginId  ?? username
  const initials    = fullName.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '?'
  const avatarColor = avBg(username)
  const isLoading   = wsStatus === 'loading'

  useEffect(() => {
    if (username) userApi.getImage(username).then((url) => { if (url) setImgUrl(url) })
  }, [username])

  const { employee } = useEmployee(username)

  const userRoles = useMemo(
    () => (user?.roles && user.roles.length > 0 ? user.roles : ['Project Member']),
    [user?.roles]
  )

  const handleCopy = () => {
    void navigator.clipboard.writeText(loginId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-start justify-center animate-fade-in" style={{ background: '#F1F5F9', padding: '40px 24px' }}>

      {/* ── Landscape card ───────────────────────────────────────────────── */}
      <div
        className="flex rounded-2xl overflow-hidden w-full"
        style={{
          maxWidth:  1100,
          minHeight: 340,
          border:    '1px solid #E2E8F0',
          boxShadow: '0 4px 32px rgba(0,0,0,.09)',
        }}
      >

        {/* ══ LEFT — identity panel ══════════════════════════════════════════ */}
        <div
          className="flex flex-col items-center justify-center flex-shrink-0"
          style={{
            width:      320,
            padding:    '40px 28px',
            background: 'linear-gradient(160deg, #1e1b4b 0%, #4c1d95 55%, #6d28d9 100%)',
            position:   'relative',
            overflow:   'hidden',
          }}
        >
          {/* Geometric ring accents */}
          <div style={{ position: 'absolute', top: -52, right: -52, width: 180, height: 180, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.07)' }}/>
          <div style={{ position: 'absolute', top: -28, right: -28, width: 108, height: 108, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.07)' }}/>
          <div style={{ position: 'absolute', bottom: -60, left: -40, width: 180, height: 180, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)' }}/>

          {/* Avatar */}
          <div style={{ position: 'relative', marginBottom: 16, zIndex: 1 }}>
            {imgUrl ? (
              <div style={{
                width: 96, height: 96, borderRadius: '50%', overflow: 'hidden',
                border: '3px solid rgba(255,255,255,0.25)', boxShadow: '0 4px 20px rgba(0,0,0,.35)',
              }}>
                <img
                  src={imgUrl}
                  alt={fullName}
                  onError={() => setImgUrl(null)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            ) : (
              <div
                className="flex items-center justify-center font-bold select-none"
                style={{
                  width: 96, height: 96, borderRadius: '50%',
                  background: avatarColor, fontSize: 32, color: 'white',
                  border: '3px solid rgba(255,255,255,0.25)',
                  boxShadow: '0 4px 20px rgba(0,0,0,.35)',
                }}
              >
                {initials}
              </div>
            )}
            {/* Status dot */}
            <span style={{
              position: 'absolute', bottom: 4, right: 4,
              width: 13, height: 13, borderRadius: '50%',
              background: isLoading ? '#F59E0B' : '#22C55E',
              border: '2.5px solid #4c1d95',
              transition: 'background 300ms',
            }}/>
          </div>

          {/* Name */}
          <h2 style={{
            fontSize: 16, fontWeight: 700, color: 'white',
            textAlign: 'center', lineHeight: 1.3, zIndex: 1,
          }}>
            {fullName || 'Current User'}
          </h2>

          {/* Login ID + copy */}
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              marginTop: 7, zIndex: 1,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 20, padding: '3px 10px 3px 12px',
            }}
          >
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.75)' }}>
              {loginId}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy ID'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                color: copied ? '#4ade80' : 'rgba(255,255,255,0.5)',
                transition: 'color 150ms', flexShrink: 0,
              }}
            >
              {copied ? (
                <svg fill="none" viewBox="0 0 12 12" width="12" height="12">
                  <path d="M2 6.5l3 2.5 5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg fill="none" viewBox="0 0 12 12" width="12" height="12">
                  <rect x="4.5" y="4.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M3 7.5H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h4.5a1 1 0 0 1 1 1v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          </div>

          {/* Role chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 14, zIndex: 1 }}>
            {userRoles.map((role) => (
              <span
                key={role}
                style={{
                  fontSize: 11, fontWeight: 600,
                  background: 'rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.9)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 20, padding: '3px 10px',
                }}
              >
                {role}
              </span>
            ))}
          </div>
        </div>

        {/* ══ RIGHT — info + actions ═════════════════════════════════════════ */}
        <div
          className="flex flex-col flex-1"
          style={{ background: 'white' }}
        >

          {/* Info rows */}
          <div style={{ flex: 1, padding: '28px 32px 20px' }}>
            <p style={{
              fontSize: 10, fontWeight: 700, color: '#94A3B8',
              textTransform: 'uppercase', letterSpacing: '0.1em',
              marginBottom: 8,
            }}>
              Information
            </p>
            <InfoRow icon={<IcPhone     />} label="Mobile"      value={employee?.mobile           ?? ''} />
            <InfoRow icon={<IcGlobe     />} label="Nationality" value={employee?.nationality      ?? ''} />
            <InfoRow icon={<IcGender    />} label="Gender"      value={employee?.gender           ?? ''} />
            <InfoRow icon={<IcCake      />} label="Age"         value={employee?.age != null ? `${employee.age} years` : ''} />
            <InfoRow icon={<IcBadge     />} label="Status"      value={employee?.employmentStatus ?? ''} />
            <InfoRow icon={<IcBriefcase />} label="Hire Type"   value={employee?.hireType         ?? ''} />
          </div>

          {/* Divider + sign out */}
          <div style={{ borderTop: '1px solid #F1F5F9', padding: '16px 32px 24px' }}>
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={handleLogout}
              className="disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 7, padding: '9px 0', borderRadius: 10,
                fontSize: 13, fontWeight: 600,
                background: '#FFF5F5', color: '#DC2626',
                border: '1px solid #FECACA', cursor: 'pointer',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#FEE2E2' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#FFF5F5' }}
            >
              {isLoggingOut ? (
                <>
                  <svg className="animate-spin" fill="none" viewBox="0 0 14 14" width="13" height="13">
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeOpacity=".25"/>
                    <path d="M12 7a5 5 0 0 0-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Signing out…
                </>
              ) : (
                <>
                  <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
                    <path d="M5.5 2.5H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    <path d="M9 10l3-2.5L9 5M12 7.5H5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Sign Out
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
