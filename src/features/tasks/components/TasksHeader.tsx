import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { Project } from '../../projects/types/project.types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface TasksHeaderProps {
  projects:              Project[]
  projectFilter:         string
  onProjectFilterChange: (v: string) => void
  totalCount:            number
  overdueCount:          number
  isLoading:             boolean
  onRefresh:             () => void
  myTasksOnly:           boolean
  onMyTasksOnlyChange:   (v: boolean) => void
  showClosed:            boolean
  onShowClosedChange:    (v: boolean) => void
  onAddTask:             () => void
  /** Only pass for the List view — shows the Group dropdown in the toolbar. */
  groupBy?:              'status' | 'none'
  onGroupByChange?:      (v: 'status' | 'none') => void
}

// ─── Static data ─────────────────────────────────────────────────────────────

const TAB_ITEMS = [
  { label: 'List',  to: '/tasks' },
  { label: 'Board', to: '/tasks/kanban' },
  { label: 'Tree',  to: '/tasks/tree' },
  { label: 'Gantt', to: '/tasks/gantt' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function TasksHeader({
  projects,
  projectFilter,
  onProjectFilterChange,
  totalCount,
  overdueCount,
  isLoading,
  onRefresh,
  myTasksOnly,
  onMyTasksOnlyChange,
  showClosed,
  onShowClosedChange,
  onAddTask,
  groupBy,
  onGroupByChange,
}: TasksHeaderProps) {
  const [showGroupMenu, setShowGroupMenu] = useState(false)

  const selectedProject = projects.find((p) => p.name === projectFilter)

  return (
    <>
      {/* ══ Breadcrumb bar (44px) ══ */}
      <div
        style={{
          height: 44,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 6,
          borderBottom: '1px solid #F3F4F6',
          background: 'white',
        }}
      >
        {/* Back button */}
        <button
          type="button"
          style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}
        >
          <svg fill="none" viewBox="0 0 14 14" width={12} height={12}>
            <path d="M9 3.5L5 7l4 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4"/>
          </svg>
        </button>

        {/* Breadcrumb path */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            style={{ fontSize: 13, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
            onClick={() => onProjectFilterChange('all')}
          >
            Team Space
          </button>
          <span style={{ fontSize: 13, color: '#D1D5DB' }}>/</span>
          {selectedProject ? (
            <>
              <button
                type="button"
                style={{ fontSize: 13, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
                onClick={() => onProjectFilterChange('all')}
              >
                All Tasks
              </button>
              <span style={{ fontSize: 13, color: '#D1D5DB' }}>/</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', padding: '2px 4px' }}>
                {selectedProject.displayName}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', padding: '2px 4px' }}>All Tasks</span>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Task count */}
        <span style={{ fontSize: 11.5, color: '#9CA3AF', fontWeight: 500 }}>
          {totalCount} task{totalCount !== 1 ? 's' : ''}
          {overdueCount > 0 && <span style={{ color: '#EF4444', marginLeft: 8 }}>· {overdueCount} overdue</span>}
        </span>

        {/* Refresh */}
        <button
          type="button"
          onClick={onRefresh}
          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}
          title="Refresh"
          className={isLoading ? 'animate-spin' : ''}
        >
          <svg fill="none" viewBox="0 0 16 16" width={14} height={14}>
            <path d="M14 8A6 6 0 1 1 8 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M8 2l2.5 2.5L8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* ══ Tab bar (40px) ══ */}
      <div
        style={{
          height: 40,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          borderBottom: '1px solid #F3F4F6',
          background: 'white',
        }}
      >
        {TAB_ITEMS.map(({ label, to }) => (
          <NavLink
            key={to}
            to={projectFilter !== 'all' ? `${to}?project=${encodeURIComponent(projectFilter)}` : to}
            end={to === '/tasks'}
            style={{ textDecoration: 'none' }}
          >
            {({ isActive }) => (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#7B3FF2' : '#6B7280',
                  borderBottom: isActive ? '2px solid #7B3FF2' : '2px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'color 150ms',
                  marginBottom: -1,
                }}
              >
                {label}
              </div>
            )}
          </NavLink>
        ))}
      </div>

      {/* ══ Toolbar (40px) ══ */}
      <div
        style={{
          height: 40,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 8,
          borderBottom: '1px solid #F3F4F6',
          background: 'white',
        }}
      >
        {/* Group dropdown — only shown in List view */}
        {groupBy !== undefined && onGroupByChange && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowGroupMenu((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                height: 26,
                padding: '0 10px',
                borderRadius: 6,
                background: groupBy === 'status' ? '#F3F0FF' : 'transparent',
                color: groupBy === 'status' ? '#7B3FF2' : '#6B7280',
                fontSize: 12,
                fontWeight: groupBy === 'status' ? 600 : 500,
                border: groupBy === 'status' ? '1px solid #C4B5FD' : '1px solid #E5E7EB',
                cursor: 'pointer',
              }}
            >
              <svg fill="none" viewBox="0 0 14 14" width={11} height={11}>
                <path d="M2 4h10M4 7h6M6 10h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
              </svg>
              Group{groupBy === 'status' ? ': Status' : ''}
              <svg fill="none" viewBox="0 0 10 10" width={8} height={8} style={{ marginLeft: 1, opacity: 0.6 }}>
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
              </svg>
            </button>

            {showGroupMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowGroupMenu(false)} />
                <div
                  style={{
                    position: 'absolute',
                    top: 30,
                    left: 0,
                    zIndex: 50,
                    background: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: 8,
                    boxShadow: '0 4px 16px rgba(0,0,0,.10)',
                    minWidth: 140,
                    padding: '4px 0',
                    overflow: 'hidden',
                  }}
                >
                  <p style={{ fontSize: 10.5, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 12px 4px' }}>
                    Group by
                  </p>
                  {([
                    { value: 'status', label: 'Status' },
                    { value: 'none',   label: 'None'   },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { onGroupByChange(opt.value); setShowGroupMenu(false) }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '7px 12px',
                        background: groupBy === opt.value ? '#F3F0FF' : 'transparent',
                        color: groupBy === opt.value ? '#7B3FF2' : '#374151',
                        fontSize: 13,
                        fontWeight: groupBy === opt.value ? 600 : 400,
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {groupBy === opt.value ? (
                        <svg fill="none" viewBox="0 0 12 12" width={11} height={11} style={{ flexShrink: 0 }}>
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
                        </svg>
                      ) : (
                        <span style={{ width: 11, height: 11, flexShrink: 0, display: 'inline-block' }} />
                      )}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Filter */}
        <button
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 6, background: 'transparent', color: '#6B7280', fontSize: 12, fontWeight: 500, border: '1px solid #E5E7EB', cursor: 'pointer' }}
        >
          <svg fill="none" viewBox="0 0 14 14" width={11} height={11}>
            <path d="M1 3h12M3 7h8M5.5 11h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
          </svg>
          Filter
        </button>

        {/* Sort */}
        <button
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 6, background: 'transparent', color: '#6B7280', fontSize: 12, fontWeight: 500, border: '1px solid #E5E7EB', cursor: 'pointer' }}
        >
          <svg fill="none" viewBox="0 0 14 14" width={11} height={11}>
            <path d="M2 4h5M2 7h8M2 10h11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
          </svg>
          Sort
        </button>

        {/* Project filter */}
        {projects.length > 0 && (
          <select
            value={projectFilter}
            onChange={(e) => onProjectFilterChange(e.target.value)}
            style={{ height: 26, padding: '0 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12, color: '#374151', background: 'white', cursor: 'pointer', outline: 'none' }}
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.name} value={p.name}>{p.displayName}</option>
            ))}
          </select>
        )}

        <div style={{ flex: 1 }} />

        {/* My Tasks toggle */}
        <button
          type="button"
          onClick={() => onMyTasksOnlyChange(!myTasksOnly)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            height: 26,
            padding: '0 10px',
            borderRadius: 6,
            background: myTasksOnly ? '#F3F0FF' : 'transparent',
            color: myTasksOnly ? '#7B3FF2' : '#6B7280',
            fontSize: 12,
            fontWeight: myTasksOnly ? 600 : 400,
            border: myTasksOnly ? '1px solid #C4B5FD' : '1px solid #E5E7EB',
            cursor: 'pointer',
          }}
        >
          <svg fill="none" viewBox="0 0 14 14" width={11} height={11}>
            <circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M2 12c1-2.5 3-4 5-4s4 1.5 5 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
          </svg>
          My Tasks
        </button>

        {/* Show/Hide Done toggle */}
        <button
          type="button"
          onClick={() => onShowClosedChange(!showClosed)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            height: 26,
            padding: '0 10px',
            borderRadius: 6,
            background: showClosed ? '#F0FDF4' : 'transparent',
            color: showClosed ? '#15803D' : '#6B7280',
            fontSize: 12,
            fontWeight: showClosed ? 600 : 400,
            border: showClosed ? '1px solid #86EFAC' : '1px solid #E5E7EB',
            cursor: 'pointer',
          }}
        >
          {showClosed ? 'Hide Done' : 'Show Done'}
        </button>

        {/* Add Task */}
        <button
          type="button"
          onClick={onAddTask}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 28,
            padding: '0 14px',
            borderRadius: 7,
            background: '#111827',
            color: 'white',
            fontSize: 12.5,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <svg fill="none" viewBox="0 0 12 12" width={11} height={11}>
            <path d="M6 1v10M1 6h10" stroke="white" strokeLinecap="round" strokeWidth="1.8"/>
          </svg>
          Add Task
        </button>
      </div>
    </>
  )
}
