import React, { useState, type ReactNode } from 'react'

import { useEmployee } from '../hooks/useEmployee'
import { useAuthStore } from '../../../store/authStore'

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabKey = 'personal' | 'job' | 'salary' | 'payslips' | 'documents'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'personal',  label: 'Personal Information' },
  { key: 'job',       label: 'Job Information'       },
  { key: 'salary',    label: 'Salary Information'    },
  { key: 'payslips',  label: 'Payslips'               },
  { key: 'documents', label: 'Documents'              },
]

// ─── Avatar color helper (matches palette used across the app) ────────────────

function avBg(s: string): string {
  const palette = ['#6366f1', '#7c3aed', '#2563eb', '#059669', '#d97706', '#0891b2']
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

// ─── Inline SVG icon set ──────────────────────────────────────────────────────

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
    <path d="M4.5 3c0-1 .5-1.5 .5-1.5M7 3c0-1 .5-1.5 .5-1.5M9.5 3c0-1 .5-1.5 .5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
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
          className="text-[10.5px] font-semibold uppercase tracking-wider leading-none"
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

// ─── Right-panel info card ────────────────────────────────────────────────────

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
        background:   'white',
        border:       '1px solid #E5E7EB',
        boxShadow:    '0 1px 2px rgba(0,0,0,.06)',
      }}
    >
      {/* Card header */}
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

      {/* Rows */}
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

// ─── Work in progress state ───────────────────────────────────────────────────

const WIP_META: Record<string, { icon: React.ReactNode; desc: string }> = {
  'Job Information': {
    icon: (
      <svg fill="none" viewBox="0 0 24 24" width="22" height="22">
        <rect x="2" y="7" width="20" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
        <path d="M2 13h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M10 13v2M14 13v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    desc: 'Department, designation, reporting manager, date of joining, and employment contract details.',
  },
  'Salary Information': {
    icon: (
      <svg fill="none" viewBox="0 0 24 24" width="22" height="22">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M12 7v10M9.5 9.5C9.5 8.4 10.6 7.5 12 7.5s2.5.9 2.5 2-.9 2-2.5 2-2.5.9-2.5 2 1.1 2 2.5 2 2.5-.9 2.5-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    desc: 'Salary structure, CTC breakdown, allowances, deductions, and tax configuration.',
  },
  'Payslips': {
    icon: (
      <svg fill="none" viewBox="0 0 24 24" width="22" height="22">
        <path d="M4 4h16v16H4z" stroke="none"/>
        <path d="M6 3h12l2 4H4L6 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <rect x="4" y="7" width="16" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M9 12h6M9 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    desc: 'Monthly payslips, year-to-date earnings, and downloadable PDF salary statements.',
  },
  'Documents': {
    icon: (
      <svg fill="none" viewBox="0 0 24 24" width="22" height="22">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
        <path d="M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    desc: 'Offer letters, contracts, ID proofs, certificates, and other HR-attached documents.',
  },
}

function WorkInProgress({ label }: { label: string }) {
  const meta = WIP_META[label]
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'white', border: '1px solid #E5E7EB', boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}
    >
      {/* Top accent bar */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, #7B3FF2 0%, #a78bfa 50%, #c4b5fd 100%)' }}/>

      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">

        {/* Icon */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
          style={{
            background:  'linear-gradient(135deg, #F3F0FF 0%, #EDE9FE 100%)',
            color:       '#7B3FF2',
            boxShadow:   '0 2px 12px rgba(123,63,242,.12)',
          }}
        >
          {meta?.icon ?? (
            <svg fill="none" viewBox="0 0 24 24" width="22" height="22">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.7"/>
              <path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          )}
        </div>

        {/* Badge */}
        <div className="flex items-center gap-1.5 mb-3">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest"
            style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"/>
            Work in Progress
          </span>
        </div>

        <h3 className="text-[16px] font-bold mb-2" style={{ color: '#111827' }}>
          {label}
        </h3>
        <p className="text-[13px] leading-relaxed max-w-sm" style={{ color: '#6B7280' }}>
          {meta?.desc ?? 'This section is actively being built. Check back soon.'}
        </p>

        {/* Progress bar */}
        <div className="mt-7 w-48">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10.5px] font-semibold" style={{ color: '#9CA3AF' }}>Build progress</span>
            <span className="text-[10.5px] font-bold" style={{ color: '#7B3FF2' }}>Coming soon</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F3F4F6' }}>
            <div
              className="h-full rounded-full"
              style={{ width: '60%', background: 'linear-gradient(90deg, #7B3FF2, #a78bfa)' }}
            />
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function EmployeeProfilePage() {
  const user = useAuthStore((s) => s.user)

  const [activeTab, setActiveTab] = useState<TabKey>('personal')
  const [copied,    setCopied]    = useState(false)

  const username    = user?.username ?? ''
  const fullName    = user?.fullName ?? username
  const initials    = fullName.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '?'
  const avatarColor = avBg(username)

  const { employee, loading } = useEmployee(username)

  const employeeId = employee?.id ?? ''

  const handleCopyId = () => {
    if (!employeeId) return
    void navigator.clipboard.writeText(employeeId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen animate-fade-in" style={{ background: '#F8FAFC' }}>
      <div
        className="mx-auto px-4 py-5 md:px-6 lg:px-8"
        style={{ maxWidth: 1360 }}
      >
        <div className="flex flex-col lg:flex-row gap-5 items-start">

          {/* ══════════════════════════════════════════════════════════════════
              LEFT PANEL — profile summary
          ══════════════════════════════════════════════════════════════════ */}
          <div
            className="w-full lg:w-80 flex-shrink-0 rounded-2xl overflow-hidden"
            style={{
              background:  'white',
              border:      '1px solid #E5E7EB',
              boxShadow:   '0 1px 2px rgba(0,0,0,.08)',
            }}
          >

            {/* Cover + avatar ──────────────────────────────────────────────── */}
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
                    <pattern id="ep-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                      <circle cx="2" cy="2" r="1.5" fill="white"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#ep-dots)"/>
                </svg>

                {/* Ambient glow blobs */}
                <div style={{
                  position: 'absolute', top: -30, right: '18%',
                  width: 140, height: 140, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)', filter: 'blur(28px)',
                }}/>
                <div style={{
                  position: 'absolute', bottom: -50, left: '4%',
                  width: 170, height: 170, borderRadius: '50%',
                  background: 'rgba(99,102,241,0.22)', filter: 'blur(36px)',
                }}/>
              </div>

              {/* Avatar */}
              <div style={{ position: 'absolute', bottom: -38, left: 20 }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  {/* Avatar tile */}
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

                  {/* Edit-photo button */}
                  <button
                    type="button"
                    title="Change photo"
                    className="absolute flex items-center justify-center rounded-full"
                    style={{
                      bottom:     -3,
                      right:      -3,
                      width:      24,
                      height:     24,
                      background: '#1F2937',
                      border:     '2.5px solid white',
                      cursor:     'pointer',
                      transition: 'background 150ms',
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

            {/* Panel body ──────────────────────────────────────────────────── */}
            <div className="px-5 pb-6">

              {/* Name */}
              <h2
                className="text-[17px] font-bold leading-tight"
                style={{ color: '#111827' }}
              >
                {fullName || 'Employee Name'}
              </h2>

              {/* Employee ID + copy */}
              <div className="flex items-center gap-1.5 mt-1 mb-3">
                {loading ? (
                  <span
                    className="rounded"
                    style={{ width: 80, height: 14, background: '#F3F4F6', display: 'inline-block' }}
                  />
                ) : (
                  <span
                    className="text-[11.5px] font-mono font-medium"
                    style={{ color: '#9CA3AF' }}
                  >
                    {employeeId || '—'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleCopyId}
                  title={copied ? 'Copied!' : 'Copy ID'}
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width:      22,
                    height:     22,
                    borderRadius: 5,
                    background: 'none',
                    border:     'none',
                    cursor:     'pointer',
                    color:      copied ? '#22C55E' : '#9CA3AF',
                    transition: 'color 150ms',
                    flexShrink: 0,
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

              {/* Designation badge */}
              {employee?.designation && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold"
                  style={{
                    background: '#F3F0FF',
                    color:      '#7B3FF2',
                    border:     '1px solid #E9DDFF',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: '#7B3FF2' }}
                  />
                  {employee.designation}
                </span>
              )}

              {/* Divider */}
              <div style={{ height: 1, background: '#F3F4F6', margin: '16px 0' }}/>

              {/* Section label */}
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                style={{ color: '#9CA3AF' }}
              >
                Basic Information
              </p>

              {/* Info items */}
              <BasicInfoItem icon={<IcPhone     />} label="Mobile Phone"      value={employee?.mobile           ?? ''} />
              <BasicInfoItem icon={<IcGlobe     />} label="Nationality"       value={employee?.nationality      ?? ''} />
              <BasicInfoItem icon={<IcGender    />} label="Gender"            value={employee?.gender           ?? ''} />
              <BasicInfoItem icon={<IcCake      />} label="Age"               value={employee?.age != null ? `${employee.age} years` : ''} />
              <BasicInfoItem icon={<IcBadge     />} label="Employment Status" value={employee?.employmentStatus ?? ''} />
              <BasicInfoItem icon={<IcBriefcase />} label="Hire Type"         value={employee?.hireType         ?? ''} />

            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              RIGHT CONTENT — tab navigation + information cards
          ══════════════════════════════════════════════════════════════════ */}
          <div className="flex-1 min-w-0 flex flex-col">

            {/* Tab bar ─────────────────────────────────────────────────────── */}
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
                  const isActive = activeTab === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveTab(key)}
                      style={{
                        display:       'flex',
                        alignItems:    'center',
                        padding:       '0 14px',
                        fontSize:      13,
                        fontWeight:    isActive ? 600 : 400,
                        color:         isActive ? '#7B3FF2' : '#6B7280',
                        background:    'none',
                        border:        'none',
                        borderBottom:  isActive ? '2px solid #7B3FF2' : '2px solid transparent',
                        cursor:        'pointer',
                        whiteSpace:    'nowrap',
                        transition:    'color 150ms',
                        marginBottom:  -1,
                        flexShrink:    0,
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Personal Information ───────────────────────────────────── */}
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
                  <CardRow label="Address"        value={employee?.address      ?? ''} />
                  <CardRow label="Address Line 2" value={employee?.addressLine2 ?? ''} />
                  <CardRow label="City"           value={employee?.city         ?? ''} />
                  <CardRow label="Postal Code"    value={employee?.postalCode   ?? ''} />
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

            {/* ── Job / Salary / Payslips / Documents (coming soon) ─────── */}
            {activeTab !== 'personal' && (
              <WorkInProgress label={TABS.find((t) => t.key === activeTab)?.label ?? ''} />
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
