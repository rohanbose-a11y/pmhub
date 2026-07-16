// Channels — Coming Soon

const FEATURES = [
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M4 6h14M4 10h10M4 14h7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
        <path d="M18 14l2 4-4-1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4"/>
      </svg>
    ),
    color: 'bg-violet-50 text-violet-500',
    title: 'Topic-based channels',
    desc: '#general, #design, #dev — organise conversations around projects, topics, or teams so nothing gets lost.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M3 5h10a2 2 0 012 2v5a2 2 0 01-2 2H8l-3 3V14H5a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M15 9h2a2 2 0 012 2v4a2 2 0 01-2 2h-2l-2 2v-2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      </svg>
    ),
    color: 'bg-blue-50 text-blue-500',
    title: 'Threaded replies',
    desc: 'Keep discussions focused. Reply in-thread to any message without cluttering the main channel.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M4 14l4-4 3 3 4-5 3 3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6"/>
        <rect x="3" y="3" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    color: 'bg-emerald-50 text-emerald-500',
    title: 'File & image sharing',
    desc: 'Drop files, screenshots, and docs directly into the conversation. Preview images inline without leaving the channel.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M15 5l-8 6 8 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6"/>
        <path d="M3 11h12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
        <path d="M17 8h2v6h-2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4"/>
      </svg>
    ),
    color: 'bg-amber-50 text-amber-500',
    title: 'Pinned messages',
    desc: 'Pin important decisions, links, and announcements so the whole channel can find them anytime.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <circle cx="9.5" cy="9.5" r="5.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M14.5 14.5L19 19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
      </svg>
    ),
    color: 'bg-rose-50 text-rose-500',
    title: 'Smart search',
    desc: 'Find any message, file, or link across all channels instantly. Full-text search with filters by person, date, and channel.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M11 3C9.24 3 7 5.24 7 8v5l-2 2v1h12v-1l-2-2V8c0-2.76-2.24-5-5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9 19a2 2 0 004 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
    color: 'bg-indigo-50 text-indigo-500',
    title: '@mentions & notifications',
    desc: '@mention teammates to get their attention. Smart notifications — never miss what matters, never drown in noise.',
  },
]

// Mock chat preview data
const MOCK_MESSAGES = [
  { user: 'RA', color: 'bg-violet-500', name: 'Riya A.', time: '9:14 AM', text: 'Just pushed the new task detail design to staging. Can you check if the right panel transition feels smooth?', self: false },
  { user: 'KM', color: 'bg-blue-500',   name: 'Karan M.', time: '9:17 AM', text: 'Looks great! One thing — on smaller screens the panel overlaps slightly. Quick fix.', self: false },
  { user: 'RA', color: 'bg-violet-500', name: 'Riya A.', time: '9:18 AM', text: 'Good catch. Pushing a fix now — will ping here when it\'s live.', self: false },
  { user: 'You', color: 'bg-indigo-500', name: 'You', time: '9:22 AM', text: 'Reviewed. The animation is buttery now 🎉 Marking the task done.', self: true },
]

export function ChannelsPage() {
  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-violet-50/40">

      {/* ── Hero ── */}
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-10 text-center">

        {/* Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-xl shadow-violet-200 mb-7">
          <svg fill="none" viewBox="0 0 32 32" width="30" height="30" className="text-white">
            <path d="M5 7h16a3 3 0 013 3v9a3 3 0 01-3 3h-5l-4 4-4-4H5a3 3 0 01-3-3V10a3 3 0 013-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
            <path d="M9 14h10M9 18h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
            <path d="M8 7V5a2 2 0 012-2h12a2 2 0 012 2v8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" strokeDasharray="2 2"/>
          </svg>
        </div>

        <div className="mb-4">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-violet-50 border border-violet-100 text-violet-600 text-[11px] font-bold uppercase tracking-widest">
            ✦ Coming Soon
          </span>
        </div>

        <h1 className="text-[36px] font-extrabold text-slate-900 leading-tight mb-4">
          Team Channels
        </h1>
        <p className="text-[16px] text-slate-500 leading-relaxed max-w-lg mx-auto mb-3">
          Bring every conversation into one place. Topic-based channels, threaded replies, and smart notifications — all right next to your work.
        </p>
        <p className="text-[13px] text-slate-400">
          Here's a taste of what's coming:
        </p>
      </div>

      {/* ── Chat preview ── */}
      <div className="max-w-2xl mx-auto px-6 mb-12">
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          {/* Channel header */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-300"/>
              <div className="w-2.5 h-2.5 rounded-full bg-amber-300"/>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-300"/>
            </div>
            <span className="text-slate-400 font-semibold text-[13px] ml-2">#</span>
            <span className="text-[13px] font-semibold text-slate-700">project-updates</span>
            <span className="ml-auto flex items-center gap-2">
              <span className="text-[11px] text-slate-400">4 members</span>
              <div className="flex -space-x-1.5">
                {['bg-violet-500','bg-blue-500','bg-emerald-500','bg-amber-500'].map((c, i) => (
                  <div key={i} className={`w-5 h-5 rounded-full ${c} ring-2 ring-white`}/>
                ))}
              </div>
            </span>
          </div>

          {/* Messages */}
          <div className="px-5 py-4 space-y-4">
            {MOCK_MESSAGES.map((msg, i) => (
              <div key={i} className={`flex items-start gap-3 ${msg.self ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full ${msg.color} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                  {msg.user}
                </div>
                <div className={`max-w-[72%] ${msg.self ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                  <div className={`flex items-baseline gap-2 ${msg.self ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[11.5px] font-semibold text-slate-700">{msg.name}</span>
                    <span className="text-[10.5px] text-slate-400">{msg.time}</span>
                  </div>
                  <div className={`px-3.5 py-2.5 rounded-2xl text-[12.5px] leading-relaxed ${
                    msg.self
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-slate-100 text-slate-700 rounded-tl-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Composer */}
          <div className="px-5 pb-4">
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60">
              <span className="text-[12.5px] text-slate-400 flex-1">Message #project-updates…</span>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-slate-200 opacity-50"/>
                <div className="w-6 h-6 rounded-md bg-slate-200 opacity-50"/>
                <div className="w-16 h-6 rounded-lg bg-indigo-200 opacity-50"/>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Feature grid ── */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        <p className="text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-6">Everything you'll get</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${f.color}`}>
                {f.icon}
              </div>
              <p className="text-[13.5px] font-semibold text-slate-800 mb-1">{f.title}</p>
              <p className="text-[12px] text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
