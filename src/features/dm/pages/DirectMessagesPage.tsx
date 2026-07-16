// Direct Messages — Coming Soon

const FEATURES = [
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.6"/>
        <circle cx="15" cy="8" r="4" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M2 19c0-3.314 2.686-6 6-6M12 13c3.314 0 6 2.686 6 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
      </svg>
    ),
    color: 'bg-indigo-50 text-indigo-500',
    title: 'Group DMs',
    desc: 'Start a private conversation with up to 8 teammates. No channel needed — just the people that matter.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M3 6h10a2 2 0 012 2v5a2 2 0 01-2 2H8l-3 3V15H5a2 2 0 01-2-2V8a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M6.5 10h3M6.5 12.5h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/>
      </svg>
    ),
    color: 'bg-violet-50 text-violet-500',
    title: 'Instant 1:1 messaging',
    desc: 'Send a message to any teammate directly — no email thread, no noise, just the conversation you need.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M4 9l4 4 10-8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6"/>
        <path d="M4 15l4 4 10-8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" opacity=".4"/>
      </svg>
    ),
    color: 'bg-emerald-50 text-emerald-500',
    title: 'Read receipts',
    desc: 'Know when your message has been seen. Two ticks, zero guessing — stay confident your message landed.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M11 4c-4 0-7 2.5-7 5.5 0 1.5.8 2.9 2 3.8L5 17l4.5-2c.5.1 1 .1 1.5.1 4 0 7-2.5 7-5.5S15 4 11 4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M8 10h.5M11 10h.5M14 10h.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/>
      </svg>
    ),
    color: 'bg-amber-50 text-amber-500',
    title: 'Emoji reactions',
    desc: 'React to any message with an emoji. A quick 👍 or 🎉 is often all you need — without breaking the flow.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <path d="M12 2v7l3 3-3 3v5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/>
        <path d="M12 9H5a2 2 0 000 4h7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
      </svg>
    ),
    color: 'bg-rose-50 text-rose-500',
    title: 'File & media sharing',
    desc: 'Share images, documents, and links inline. Preview without downloading — everything renders right in the chat.',
  },
  {
    icon: (
      <svg fill="none" viewBox="0 0 22 22" width="20" height="20">
        <circle cx="11" cy="9" r="4" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M4.5 19c0-3.038 2.91-5.5 6.5-5.5s6.5 2.462 6.5 5.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
        <path d="M18 6.5c.8.5 1.5 1.5 1.5 2.5 0 1.5-1.1 2.8-2.5 3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
      </svg>
    ),
    color: 'bg-sky-50 text-sky-500',
    title: 'Online presence',
    desc: 'See who\'s active, away, or in a focus session. Message the right person at the right time.',
  },
]

// Mock DM conversations list
const MOCK_DMS = [
  { initials: 'TM', color: 'bg-violet-500', name: 'Team Admin',    preview: 'Can you review the sprint report?',    time: '9:41 AM',  unread: 2, online: true  },
  { initials: 'PL', color: 'bg-blue-500',   name: 'Project Lead',  preview: 'The Gantt chart looks great now ✅',  time: 'Yesterday', unread: 0, online: false },
  { initials: 'SK', color: 'bg-emerald-500',name: 'Sara K.',        preview: 'Sent a file: wireframes_v3.fig',      time: 'Mon',       unread: 0, online: true  },
  { initials: 'AR', color: 'bg-amber-500',  name: 'Arjun R.',       preview: 'I\'ll pick that up tomorrow morning', time: 'Sun',       unread: 0, online: false },
]

// Mock single DM conversation
const MOCK_CONVERSATION = [
  { initials: 'TM', color: 'bg-violet-500', name: 'Team Admin',   time: '9:30 AM', text: 'Hey — can you share the sprint progress before the 10am call?', self: false },
  { initials: 'You', color: 'bg-indigo-600', name: 'You',          time: '9:33 AM', text: 'On it! Just wrapping up the task board. Will send in a few minutes.', self: true  },
  { initials: 'TM', color: 'bg-violet-500', name: 'Team Admin',   time: '9:34 AM', text: 'Perfect, thanks 🙏', self: false },
  { initials: 'You', color: 'bg-indigo-600', name: 'You',          time: '9:41 AM', text: 'Sent! 3 tasks completed, 2 in review, 1 blocked — flagged the blocker separately.', self: true  },
]

export function DirectMessagesPage() {
  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">

      {/* ── Hero ── */}
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-10 text-center">

        {/* Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-xl shadow-indigo-200 mb-7">
          <svg fill="none" viewBox="0 0 32 32" width="30" height="30" className="text-white">
            <path d="M6 8h12a3 3 0 013 3v7a3 3 0 01-3 3h-5l-3 3-3-3H6a3 3 0 01-3-3V11a3 3 0 013-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
            <path d="M20 11h4a3 3 0 013 3v5a3 3 0 01-3 3h-2l-2 2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M9 16h6M9 19.5h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
          </svg>
        </div>

        <div className="mb-4">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[11px] font-bold uppercase tracking-widest">
            ✦ Coming Soon
          </span>
        </div>

        <h1 className="text-[36px] font-extrabold text-slate-900 leading-tight mb-4">
          Direct Messages
        </h1>
        <p className="text-[16px] text-slate-500 leading-relaxed max-w-lg mx-auto mb-3">
          Private, fast, and focused. Message any teammate 1:1 or start a small group chat — without leaving your workspace.
        </p>
        <p className="text-[13px] text-slate-400">
          Here's what you'll be able to do:
        </p>
      </div>

      {/* ── DM UI preview ── */}
      <div className="max-w-3xl mx-auto px-6 mb-12">
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden flex" style={{ height: 320 }}>

          {/* Left — conversation list */}
          <div className="w-[200px] flex-shrink-0 border-r border-slate-100 flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-50">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-300"/>
              <div className="w-2.5 h-2.5 rounded-full bg-amber-300"/>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-300"/>
            </div>
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100">
                <svg fill="none" viewBox="0 0 12 12" width="11" height="11" className="text-slate-400"><circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/><path d="M8 8l2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3"/></svg>
                <span className="text-[11px] text-slate-400">Search…</span>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {MOCK_DMS.map((dm, i) => (
                <div key={i} className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${i === 0 ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                  <div className="relative flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full ${dm.color} flex items-center justify-center text-white text-[9px] font-bold`}>{dm.initials}</div>
                    <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white ${dm.online ? 'bg-emerald-400' : 'bg-slate-300'}`}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-[11px] font-semibold truncate ${i === 0 ? 'text-indigo-700' : 'text-slate-700'}`}>{dm.name}</span>
                      <span className="text-[9.5px] text-slate-400 flex-shrink-0">{dm.time}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400 truncate flex-1">{dm.preview}</span>
                      {dm.unread > 0 && <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[8px] font-bold flex items-center justify-center flex-shrink-0">{dm.unread}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — conversation */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-white">
              <div className="relative">
                <div className="w-7 h-7 rounded-full bg-violet-500 flex items-center justify-center text-white text-[9px] font-bold">TM</div>
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-white"/>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-slate-800">Team Admin</p>
                <p className="text-[10px] text-emerald-500 font-medium">Active now</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-hidden px-4 py-3 space-y-3">
              {MOCK_CONVERSATION.map((msg, i) => (
                <div key={i} className={`flex items-end gap-2 ${msg.self ? 'flex-row-reverse' : ''}`}>
                  {!msg.self && (
                    <div className={`w-6 h-6 rounded-full ${msg.color} flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0`}>{msg.initials}</div>
                  )}
                  <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-[11.5px] leading-relaxed ${
                    msg.self
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[9.5px] text-slate-400 pb-0.5">{msg.time}</span>
                </div>
              ))}
            </div>

            {/* Composer */}
            <div className="px-4 pb-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60">
                <span className="text-[11.5px] text-slate-400 flex-1">Message Team Admin…</span>
                <div className="flex gap-1.5">
                  <div className="w-5 h-5 rounded bg-slate-200 opacity-50"/>
                  <div className="w-5 h-5 rounded bg-slate-200 opacity-50"/>
                  <div className="w-12 h-5 rounded-lg bg-indigo-200 opacity-50"/>
                </div>
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
