import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEmployee } from '../../employees/hooks/useEmployee'
import { useAuthStore } from '../../../store/authStore'
import { useWorkStore } from '../../../store/workStore'

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabKey = 'personal' | 'job' | 'salary' | 'payslips' | 'documents'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'personal',  label: 'Personal Information' },
  { key: 'job',       label: 'Job Information'       },
  { key: 'salary',    label: 'Salary Information'    },
  { key: 'payslips',  label: 'Payslips'               },
  { key: 'documents', label: 'Documents'              },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avBg(s: string): string {
  const palette = ['#6366f1', '#7c3aed', '#2563eb', '#059669', '#d97706', '#0891b2']
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

// ─── Icon set (inline SVG) ────────────────────────────────────────────────────

const IcPhone = () => (
  <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
    <rect x="3.5" y="1" width="7" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <circle cx="7" cy="10.5" r="0.75" fill="currentColor"/>
    <path d="M5.5 3h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
)
const IcGlobe = () => (
  <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M7 1.5C5.5 3.5 5 5.1 5 7s.5 3.5 2 5.5M7 1.5c1.5 2 2 3.6 2 5.5s-.5 3.5-2 5.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M1.5 7h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
)
const IcGender = () => (
  <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
    <circle cx="6.5" cy="6.5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M6.5 10v3M4.5 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
)
const IcCake = () => (
  <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
    <path d="M4.5 3.5c0-1 .5-1.5.5-1.5M7 3.5c0-1 .5-1.5.5-1.5M9.5 3.5c0-1 .5-1.5.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <rect x="1.5" y="5.5" width="11" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M4.5 5.5v-2M7 5.5v-2M9.5 5.5v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
)
const IcBadge = () => (
  <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
    <rect x="1.5" y="2.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <circle cx="4.5" cy="7" r="1.2" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M7 5.5h4M7 7h3M7 8.5h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)
const IcBriefcase = () => (
  <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
    <rect x="1.5" y="4.5" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M5 4.5V3.5A1.5 1.5 0 0 1 6.5 2h1A1.5 1.5 0 0 1 9 3.5v1" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M1.5 8h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
)
const IcAcademic = () => (
  <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
    <path d="M7 2L1 5.5l6 3 6-3L7 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M4 7.5V10.5c1 1 2 1.5 3 1.5s2-.5 3-1.5V7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M13 5.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
)
const IcHome = () => (
  <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
    <path d="M2 6.5L7 2l5 4.5V12.5a.5.5 0 0 1-.5.5H9v-4H5v4H2.5a.5.5 0 0 1-.5-.5V6.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
)
const IcReceipt = () => (
  <svg fill="none" viewBox="0 0 14 14" width="13" height="13">
    <path d="M2.5 1.5h9v11L9.5 11l-2.5 1.5-2.5-1.5-2 1.5V1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M5 5h4M5 7.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
)
const IcPencil = () => (
  <svg fill="none" viewBox="0 0 12 12" width="11" height="11">
    <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
)

// ─── Left-panel info item ─────────────────────────────────────────────────────

function BasicInfoItem({
  icon, label, value,
}: {
  icon:  ReactNode
  label: string
  value: string
}) {
  return (
    <div
      className="flex items-center gap-3 py-2.5"
      style={{ borderBottom: '1px solid #F3F4F6' }}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: '#F3F0FF', color: '#7B3FF2' }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="text-[10px] font-semibold uppercase tracking-wider leading-none"
          style={{ color: '#9CA3AF' }}
        >
          {label}
        </p>
        <p
          className="text-[12.5px] font-semibold mt-1 truncate"
          style={{ color: '#1F2937' }}
        >
          {value || '—'}
        </p>
      </div>
    </div>
  )
}

// ─── Info card (right panel) ──────────────────────────────────────────────────

function InfoCard({
  icon, title, onEdit, children,
}: {
  icon:     ReactNode
  title:    string
  onEdit?:  () => void
  children: ReactNode
}) {
  return (
    <div
      className="rounded-2xl p-5 mb-4"
      style={{
        background: 'white',
        border:     '1px solid #E5E7EB',
        boxShadow:  '0 1px 2px rgba(0,0,0,.06)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: '#F3F0FF', color: '#7B3FF2' }}
          >
            {icon}
          </div>
          <h3 className="text-[13.5px] font-bold" style={{ color: '#111827' }}>
            {title}
          </h3>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
            style={{
              color:      '#7B3FF2',
              background: '#F3F0FF',
              border:     '1px solid #E9DDFF',
              cursor:     'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#E9DDFF' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#F3F0FF' }}
          >
            <IcPencil />
            Edit
          </button>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}

// ─── Two-column data row ──────────────────────────────────────────────────────

function CardRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="grid grid-cols-2 gap-4 py-3"
      style={{ borderBottom: '1px solid #F9FAFB' }}
    >
      <span className="text-[12px] font-medium" style={{ color: '#9CA3AF' }}>
        {label}
      </span>
      <span
        className="text-[12.5px] font-semibold text-right truncate"
        style={{ color: '#1F2937' }}
      >
        {value || '—'}
      </span>
    </div>
  )
}

// ─── Coming-soon placeholder ──────────────────────────────────────────────────

function ComingSoon({ label }: { label: string }) {
  return (
    <div
      className="rounded-2xl flex flex-col items-center justify-center py-24"
      style={{ background: 'white', border: '1px solid #E5E7EB', boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: '#F3F0FF' }}
      >
        <svg fill="none" viewBox="0 0 24 24" width="22" height="22" style={{ color: '#C4B5FD' }}>
          <path d="M9 12h6M9 16h6M9 8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M5 4a2 2 0 0 1 2-2h8l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>
      </div>
      <p className="text-[13.5px] font-semibold" style={{ color: '#374151' }}>{label}</p>
      <p className="text-[12px] mt-1" style={{ color: '#9CA3AF' }}>This section is under development</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ProfilePage() {
  const navigate = useNavigate()
  const user     = useAuthStore((s) => s.user)
  const logout   = useAuthStore((s) => s.logout)
  const wsStatus = useWorkStore((s) => s.status)

  const [activeTab,   setActiveTab]   = useState<TabKey>('personal')
  const [copied,      setCopied]      = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const username    = user?.username ?? ''
  const fullName    = user?.fullName ?? username
  const loginId     = user?.loginId  ?? username
  const initials    = fullName.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '?'
  const avatarColor = avBg(username)
  const isLoading   = wsStatus === 'loading'

  const { employee } = useEmployee(username)

  const userRoles = useMemo(
    () => (user?.roles && user.roles.length > 0 ? user.roles : ['Project Member']),
    [user?.roles]
  )

  // ── Actions ───────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen animate-fade-in" style={{ background: '#F8FAFC' }}>
      <div
        className="mx-auto px-4 py-5 md:px-6 lg:px-8"
        style={{ maxWidth: 1360 }}
      >
        <div className="flex flex-col lg:flex-row gap-5 items-start">

          {/* ══════════════════════════════════════════════════════════════════
              LEFT PANEL
          ══════════════════════════════════════════════════════════════════ */}
          <div
            className="w-full lg:w-80 flex-shrink-0 rounded-2xl overflow-hidden"
            style={{
              background: 'white',
              border:     '1px solid #E5E7EB',
              boxShadow:  '0 1px 2px rgba(0,0,0,.08)',
            }}
          >

            {/* ── Cover + avatar ─────────────────────────────────────────── */}
            <div className="relative" style={{ marginBottom: 52 }}>

              {/* Cover gradient */}
              <div
                style={{
                  height:     110,
                  background: 'linear-gradient(135deg, #6366f1 0%, #7B3FF2 50%, #a855f7 100%)',
                  position:   'relative',
                  overflow:   'hidden',
                }}
              >
                {/* Dot texture */}
                <svg
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.13 }}
                  preserveAspectRatio="xMidYMid slice"
                  aria-hidden
                >
                  <defs>
                    <pattern id="pf-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                      <circle cx="2" cy="2" r="1.5" fill="white"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#pf-dots)"/>
                </svg>

                {/* Ambient blobs */}
                <div style={{ position: 'absolute', top: -28, right: '18%', width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', filter: 'blur(28px)' }}/>
                <div style={{ position: 'absolute', bottom: -46, left: '5%',  width: 170, height: 170, borderRadius: '50%', background: 'rgba(99,102,241,0.22)', filter: 'blur(36px)' }}/>
              </div>

              {/* Avatar */}
              <div style={{ position: 'absolute', bottom: -38, left: 20 }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <div
                    className="flex items-center justify-center font-bold select-none"
                    style={{
                      width:        76,
                      height:       76,
                      borderRadius: 18,
                      background:   avatarColor,
                      fontSize:     26,
                      color:        'white',
                      border:       '3px solid white',
                      boxShadow:    '0 4px 16px rgba(0,0,0,.18)',
                    }}
                  >
                    {initials}
                  </div>

                  {/* Online dot */}
                  <span
                    className="absolute rounded-full"
                    style={{
                      bottom:  6,
                      left:    6,
                      width:   12,
                      height:  12,
                      background: isLoading ? '#F59E0B' : '#22C55E',
                      border:  '2px solid white',
                      transition: 'background 300ms',
                    }}
                  />

                  {/* Edit-photo button */}
                  <button
                    type="button"
                    title="Change photo"
                    style={{
                      position:   'absolute',
                      bottom:     -3,
                      right:      -3,
                      width:      24,
                      height:     24,
                      borderRadius: '50%',
                      background: '#1F2937',
                      border:     '2.5px solid white',
                      cursor:     'pointer',
                      display:    'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 150ms',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#374151' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1F2937' }}
                  >
                    <svg fill="none" viewBox="0 0 12 12" width="11" height="11" style={{ color: 'white' }}>
                      <rect x="1" y="3.5" width="10" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
                      <circle cx="6" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M4.5 3.5l.4-1.5h2.2l.4 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* ── Identity ───────────────────────────────────────────────── */}
            <div className="px-5 pb-6">

              <h2 className="text-[17px] font-bold leading-tight" style={{ color: '#111827' }}>
                {fullName || 'Current User'}
              </h2>

              {/* Login ID + copy */}
              <div className="flex items-center gap-1.5 mt-1 mb-3">
                <span className="text-[11.5px] font-mono font-medium truncate" style={{ color: '#9CA3AF' }}>
                  {loginId}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  title={copied ? 'Copied!' : 'Copy ID'}
                  style={{
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    width:          22,
                    height:         22,
                    borderRadius:   5,
                    background:     'none',
                    border:         'none',
                    cursor:         'pointer',
                    color:          copied ? '#22C55E' : '#9CA3AF',
                    transition:     'color 150ms',
                    flexShrink:     0,
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

              {/* Role badges */}
              <div className="flex flex-wrap gap-1.5">
                {userRoles.map((role) => (
                  <span
                    key={role}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold"
                    style={{ background: '#F3F0FF', color: '#7B3FF2', border: '1px solid #E9DDFF' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#7B3FF2' }}/>
                    {role}
                  </span>
                ))}
              </div>

              {/* ── Divider ── */}
              <div style={{ height: 1, background: '#F3F4F6', margin: '16px 0' }}/>

              {/* Basic information */}
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                style={{ color: '#9CA3AF' }}
              >
                Basic Information
              </p>

              <BasicInfoItem icon={<IcPhone     />} label="Mobile Phone"      value={employee?.mobile           ?? ''} />
              <BasicInfoItem icon={<IcGlobe     />} label="Nationality"       value={employee?.nationality     ?? ''} />
              <BasicInfoItem icon={<IcGender    />} label="Gender"            value={employee?.gender          ?? ''} />
              <BasicInfoItem icon={<IcCake      />} label="Age"               value={employee?.age != null ? `${employee.age} years` : ''} />
              <BasicInfoItem icon={<IcBadge     />} label="Employment Status" value={employee?.employmentStatus ?? ''} />
              <BasicInfoItem icon={<IcBriefcase />} label="Hire Type"         value={employee?.hireType        ?? ''} />


              {/* Sign-out */}
              <div className="flex items-center justify-between pt-4in left ">
                <div>
                  <p className="text-[12.5px] font-semibold" style={{ color: '#374151' }}>Sign out</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>End your current session</p>
                </div>
                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: '#FEF2F2',
                    color:      '#EF4444',
                    border:     '1px solid #FECACA',
                    cursor:     'pointer',
                  }}
                >
                  {isLoggingOut ? (
                    <>
                      <svg className="animate-spin" fill="none" viewBox="0 0 14 14" width="12" height="12">
                        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeOpacity=".25"/>
                        <path d="M12 7a5 5 0 0 0-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      Signing out…
                    </>
                  ) : (
                    <>
                      <svg fill="none" viewBox="0 0 14 14" width="12" height="12">
                        <path d="M5.5 2.5H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <path d="M9 10l3-2.5L9 5M12 7.5H5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Sign out
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              RIGHT CONTENT
          ══════════════════════════════════════════════════════════════════ */}
          <div className="flex-1 min-w-0 flex flex-col">

            {/* ── Tab bar ────────────────────────────────────────────────── */}
            <div
              className="flex-shrink-0 rounded-2xl mb-4 overflow-x-auto scrollbar-none"
              style={{
                background: 'white',
                border:     '1px solid #E5E7EB',
                boxShadow:  '0 1px 2px rgba(0,0,0,.08)',
              }}
            >
              <div
                className="flex items-stretch"
                style={{ height: 46, padding: '0 8px', minWidth: 'max-content' }}
              >
                {TABS.map(({ key, label }) => {
                  const active = activeTab === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveTab(key)}
                      style={{
                        display:      'flex',
                        alignItems:   'center',
                        padding:      '0 14px',
                        fontSize:     13,
                        fontWeight:   active ? 600 : 400,
                        color:        active ? '#7B3FF2' : '#6B7280',
                        background:   'none',
                        border:       'none',
                        borderBottom: active ? '2px solid #7B3FF2' : '2px solid transparent',
                        cursor:       'pointer',
                        whiteSpace:   'nowrap',
                        transition:   'color 150ms',
                        marginBottom: -1,
                        flexShrink:   0,
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Personal Information ────────────────────────────────────── */}
            {activeTab === 'personal' && (
              <div>

                {/* Professional Information */}
                <InfoCard
                  icon={<IcAcademic />}
                  title="Professional Information"
                  onEdit={() => {}}
                >
                  <CardRow label="Level of Education" value={employee?.levelOfEducation ?? ''} />
                  <CardRow label="Degree"              value={employee?.degree           ?? ''} />
                  <CardRow label="Hard Skill"          value={employee?.hardSkill        ?? ''} />
                  <CardRow label="Soft Skill"          value={employee?.softSkill        ?? ''} />
                </InfoCard>

                {/* Home Address */}
                <InfoCard
                  icon={<IcHome />}
                  title="Home Address"
                  onEdit={() => {}}
                >
                  <CardRow label="Address"        value={employee?.address     ?? ''} />
                  <CardRow label="Address Line 2" value={employee?.addressLine2 ?? ''} />
                  <CardRow label="City"           value={employee?.city        ?? ''} />
                  <CardRow label="Postal Code"    value={employee?.postalCode  ?? ''} />
                </InfoCard>

                {/* Tax Information */}
                <InfoCard
                  icon={<IcReceipt />}
                  title="Tax Information"
                  onEdit={() => {}}
                >
                  <CardRow label="Tax Number" value={employee?.taxNumber ?? ''} />
                </InfoCard>

              </div>
            )}

            {/* ── All other tabs ──────────────────────────────────────────── */}
            {activeTab !== 'personal' && (
              <ComingSoon label={TABS.find((t) => t.key === activeTab)?.label ?? ''} />
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
