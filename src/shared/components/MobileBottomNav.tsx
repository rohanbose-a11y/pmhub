import type { SVGProps } from 'react'
import { NavLink } from 'react-router-dom'

function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function ProjectsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <rect x="3.5" y="4.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13.5" y="4.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.5" y="14.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 18h6.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M14 15.5h4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M14 20.5h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  )
}

function TasksIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M8 7h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M8 12h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M8 17h7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="m4.5 7 1.5 1.5L8.5 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m4.5 12 1.5 1.5 2.5-2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m4.5 17 1.5 1.5 2.5-2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  )
}

function ProfileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 19c1.4-3 4-4.5 7-4.5s5.6 1.5 7 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export const appNavItems = [
  { to: '/dashboard',  label: 'Home',     Icon: HomeIcon      },
  { to: '/projects',   label: 'Projects', Icon: ProjectsIcon  },
  { to: '/tasks',      label: 'Tasks',    Icon: TasksIcon     },
  { to: '/profile',    label: 'Profile',  Icon: ProfileIcon   },
] as const

export function MobileBottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-4 left-0 right-0 z-20 flex justify-center px-4 pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-sm bg-white/85 backdrop-blur-xl rounded-2xl border border-gray-200/50 shadow-elevated px-2 py-1.5 flex items-center justify-around">
        {appNavItems.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to}>
            {({ isActive }) => (
              <span
                className={`relative flex flex-col items-center gap-0.5 px-3.5 py-2 rounded-xl transition-all duration-200 select-none ${
                  isActive
                    ? 'text-brand-600 bg-brand-500/10'
                    : 'text-gray-400 active:text-gray-600 active:bg-gray-100'
                }`}
              >
                {/* Active pip indicator */}
                <span
                  className={`absolute top-0 left-1/2 -translate-x-1/2 h-[2.5px] rounded-full bg-brand-500 transition-all duration-300 ${
                    isActive ? 'w-5 opacity-100' : 'w-0 opacity-0'
                  }`}
                />
                <Icon className="w-[19px] h-[19px]" />
                <span className="text-[10px] font-semibold leading-none">{label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
