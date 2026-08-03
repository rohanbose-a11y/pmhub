import { Navigate } from 'react-router-dom'

import { InstallAppButton } from '../../../shared/components/InstallAppButton'
import { useAuthStore } from '../../../store/authStore'
import { LoginForm } from '../components/LoginForm'

const PmIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24">
    <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
    <rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
    <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M13 17h8M13 14h6M13 20h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const AVATARS = ['#7B3FF2', '#A78BFA', '#E879F9', '#34D399']
const INITIALS = ['R', 'A', 'S', 'K']

export function LoginPage() {
  const user   = useAuthStore((state) => state.user)
  const status = useAuthStore((state) => state.status)

  if (status === 'authenticated' && user) {
    return <Navigate replace to="/dashboard" />
  }

  return (
    <main className="h-screen overflow-hidden flex">

      {/* ════════════════════════════════════════════
          LEFT — brand + illustration panel
      ════════════════════════════════════════════ */}
      <div
        className="hidden lg:flex lg:w-[58%] h-full relative overflow-hidden flex-col"
        style={{ background: 'linear-gradient(150deg, #2A1760 0%, #190D3C 48%, #0C0620 100%)' }}
      >
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.055]"
          style={{
            backgroundImage: 'radial-gradient(circle, #9B70FF 1.5px, transparent 1.5px)',
            backgroundSize: '26px 26px',
          }}
        />
        {/* Orb — top right */}
        <div
          className="absolute -top-24 -right-24 w-[440px] h-[440px] rounded-full blur-3xl opacity-[0.22] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #7B3FF2 30%, #4C1D95 100%)' }}
        />
        {/* Orb — bottom left */}
        <div
          className="absolute -bottom-28 -left-20 w-[380px] h-[380px] rounded-full blur-3xl opacity-[0.18] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #C026D3 10%, #7B3FF2 70%)' }}
        />

        {/* ── Content ── */}
        <div className="relative z-10 flex flex-col h-full px-12 py-10">

          {/* Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-brand"
              style={{ background: 'linear-gradient(135deg, #7B3FF2 0%, #9B5CF6 100%)' }}
            >
              <PmIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-[15px] leading-none tracking-tight">Sauramandala Foundation PM</div>
              <div className="text-[9px] uppercase tracking-[0.12em] mt-0.5" style={{ color: '#9B70FF' }}>
                Project Management Suite
              </div>
            </div>
          </div>

          {/* Headline */}
          <div className="mt-9 flex-shrink-0">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium mb-5"
              style={{
                background: 'rgba(123,63,242,0.22)',
                border: '1px solid rgba(123,63,242,0.38)',
                color: '#C4B5FD',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#7B3FF2' }} />
              Connected to ERPNext
            </div>

            <h1 className="font-extrabold leading-[1.08] tracking-tight mb-3" style={{ fontSize: 'clamp(1.9rem, 2.4vw, 2.5rem)' }}>
              <span className="text-white">Plan smarter.</span>
              <br />
              <span
                style={{
                  background: 'linear-gradient(130deg, #C4B5FD 10%, #E879F9 90%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Deliver faster.
              </span>
            </h1>
            <p className="text-[0.85rem] leading-relaxed" style={{ color: '#A78BFA', maxWidth: 340 }}>
              Kanban boards, Gantt charts, and task trees —
              everything your team needs to ship on time.
            </p>
          </div>

          {/* ── Illustration ── flex-1 so it fills remaining space without overflow */}
          <div className="flex-1 min-h-0 flex items-center mt-7">
            <div className="w-full relative">

              {/* Floating chip — top right */}
              <div
                className="animate-float absolute -top-5 -right-2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-lg select-none"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)', color: '#fff' }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Task completed!
              </div>

              {/* Floating chip — bottom left */}
              <div
                className="animate-float-delayed absolute -bottom-4 -left-1 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-lg select-none"
                style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#fff' }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 3.5v2.7l1.5 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                3 tasks due today
              </div>

              {/* ── Dashboard card ── */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.055)',
                  border: '1px solid rgba(155,112,255,0.28)',
                  backdropFilter: 'blur(24px)',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                {/* Card header */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg,#7B3FF2,#A855F7)' }}
                    >
                      <PmIcon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <div className="text-white text-[12px] font-semibold leading-none">Website Redesign</div>
                      <div className="text-[9px] mt-0.5" style={{ color: '#9B70FF' }}>Sprint 4 · 6 days left</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Avatar stack */}
                    <div className="flex items-center">
                      {AVATARS.map((c, i) => (
                        <div
                          key={c}
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[7px] text-white font-bold"
                          style={{ background: c, borderColor: '#0C0620', marginLeft: i > 0 ? '-5px' : 0 }}
                        >
                          {INITIALS[i]}
                        </div>
                      ))}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: '#C4B5FD' }}>57%</div>
                  </div>
                </div>

                {/* Kanban body */}
                <div className="flex gap-2.5 p-4">

                  {/* Column — To Do */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">To Do</span>
                      </div>
                      <span className="text-[8.5px] text-slate-600 font-medium">3</span>
                    </div>
                    <div className="space-y-1.5">
                      {[
                        { tw: '72%', dw: '45%', p: '#EF4444' },
                        { tw: '55%', dw: '60%', p: '#F59E0B' },
                        { tw: '80%', dw: '38%', p: '#10B981' },
                      ].map((d, i) => (
                        <div key={i} className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.07)' }}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: d.p }} />
                            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.18)', width: d.tw, flex: 'none' }} />
                          </div>
                          <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.07)', width: d.dw }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Column — In Progress */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#F59E0B' }} />
                        <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">Active</span>
                      </div>
                      <span className="text-[8.5px] text-slate-600 font-medium">2</span>
                    </div>
                    <div className="space-y-1.5">
                      {[
                        { tw: '65%', dw: '50%', p: '#EF4444' },
                        { tw: '82%', dw: '42%', p: '#F59E0B' },
                      ].map((d, i) => (
                        <div
                          key={i}
                          className="rounded-lg p-2.5"
                          style={{
                            background: 'rgba(123,63,242,0.18)',
                            border: '1px solid rgba(123,63,242,0.28)',
                          }}
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: d.p }} />
                            <div className="h-1.5 rounded-full" style={{ background: 'rgba(167,139,250,0.42)', width: d.tw, flex: 'none' }} />
                          </div>
                          <div className="h-1 rounded-full" style={{ background: 'rgba(167,139,250,0.14)', width: d.dw }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Column — Done */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#10B981' }} />
                        <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">Done</span>
                      </div>
                      <span className="text-[8.5px] text-slate-600 font-medium">2</span>
                    </div>
                    <div className="space-y-1.5">
                      {[
                        { tw: '70%', dw: '50%' },
                        { tw: '52%', dw: '65%' },
                      ].map((d, i) => (
                        <div
                          key={i}
                          className="rounded-lg p-2.5"
                          style={{
                            background: 'rgba(16,185,129,0.1)',
                            border: '1px solid rgba(16,185,129,0.2)',
                          }}
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <svg className="w-2.5 h-2.5 flex-shrink-0" style={{ color: '#10B981' }} fill="none" viewBox="0 0 10 10">
                              <path d="M1.5 5l2.5 2.5 4.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div className="h-1.5 rounded-full" style={{ background: 'rgba(16,185,129,0.35)', width: d.tw, flex: 'none' }} />
                          </div>
                          <div className="h-1 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', width: d.dw }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Progress footer */}
                <div
                  className="px-4 pb-4"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9.5px] text-slate-400">Sprint 4 progress</span>
                    <span className="text-[9.5px] font-semibold" style={{ color: '#C4B5FD' }}>4 / 7 tasks done</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: '57%', background: 'linear-gradient(90deg, #7B3FF2 0%, #E879F9 100%)' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Stats row ── */}
          <div className="flex gap-2.5 mt-6 flex-shrink-0">
            {[
              { val: '8',   label: 'Projects',     accent: '#7B3FF2' },
              { val: '47',  label: 'Active Tasks',  accent: '#A78BFA' },
              { val: '92%', label: 'On Time',       accent: '#10B981' },
            ].map(({ val, label, accent }) => (
              <div
                key={label}
                className="flex-1 rounded-xl px-3 py-2.5"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <div className="text-[1.15rem] font-extrabold text-white leading-none">{val}</div>
                <div className="text-[9px] mt-1 font-medium" style={{ color: accent }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          RIGHT — login form panel
      ════════════════════════════════════════════ */}
      <div
        className="flex-1 h-full flex items-center justify-center overflow-y-auto p-8"
        style={{ background: '#F5F3FF' }}
      >
        {/* Subtle radial glow behind form */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(123,63,242,0.07) 0%, transparent 70%)',
          }}
        />

        <div className="relative w-full max-w-sm animate-slide-up">
          {/* Mobile-only logo */}
          <div className="flex lg:hidden items-center justify-center gap-2.5 mb-10">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-brand"
              style={{ background: 'linear-gradient(135deg, #7B3FF2, #9B5CF6)' }}
            >
              <PmIcon className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-900 text-lg">ERPNext PM</span>
          </div>

          <div className="mb-7">
            <h2 className="text-[1.6rem] font-extrabold text-slate-900 tracking-tight">Welcome back</h2>
            <p className="text-slate-500 text-sm mt-1.5">Sign in to continue to your workspace</p>
          </div>

          <LoginForm />

          <div className="mt-4">
            <InstallAppButton />
          </div>
        </div>
      </div>

    </main>
  )
}
