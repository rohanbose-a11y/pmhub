import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { Project } from '../../projects/types/project.types'

interface TasksHeaderProps {
  projects:              Project[]
  projectFilter:         string
  onProjectFilterChange: (v: string) => void
  totalCount:            number
  overdueCount:          number
  doneCount?:            number
  isLoading:             boolean
  onRefresh:             () => void
  myTasksOnly:           boolean
  onMyTasksOnlyChange:   (v: boolean) => void
  showClosed:            boolean
  onShowClosedChange:    (v: boolean) => void
  onAddTask:             () => void
  groupBy?:              'status' | 'none'
  onGroupByChange?:      (v: 'status' | 'none') => void
  onExpandAll?:          () => void
  onCollapseAll?:        () => void
}

const TAB_ITEMS = [
  { label: 'List',  to: '/tasks' },
  { label: 'Board', to: '/tasks/kanban' },
  { label: 'Tree',  to: '/tasks/tree' },
  { label: 'Gantt', to: '/tasks/gantt' },
]

export function TasksHeader({
  projects,
  projectFilter,
  onProjectFilterChange,
  totalCount,
  overdueCount,
  doneCount = 0,
  isLoading,
  onRefresh,
  myTasksOnly,
  onMyTasksOnlyChange,
  showClosed,
  onShowClosedChange,
  onAddTask,
  groupBy,
  onGroupByChange,
  onExpandAll,
  onCollapseAll,
}: TasksHeaderProps) {
  const [showGroupMenu, setShowGroupMenu] = useState(false)

  const selectedProject = projects.find((p) => p.name === projectFilter)

  const groupLabel = groupBy === 'status' ? 'Group: Status' : 'Group'

  return (
    <>
      {/* ══ Breadcrumb bar ══════════════════════════════════════════════════ */}
      <div style={{
        height:     52,
        flexShrink: 0,
        display:    'flex',
        alignItems: 'center',
        padding:    '0 20px',
        gap:        8,
        background: 'white',
        borderBottom: '1px solid #F0F0F5',
      }}>

        {/* Workspace chip */}
        <button
          type="button"
          onClick={() => onProjectFilterChange('all')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 8,
            background: 'none', border: 'none', cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F5F3FF')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          {/* Space icon */}
          <span style={{
            width: 18, height: 18, borderRadius: 5, flexShrink: 0,
            background: 'linear-gradient(135deg,#7B3FF2,#A78BFA)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg fill="none" viewBox="0 0 10 10" width={9} height={9}>
              <rect x="1" y="1" width="3.5" height="3.5" rx="1" fill="white" fillOpacity=".9"/>
              <rect x="5.5" y="1" width="3.5" height="3.5" rx="1" fill="white" fillOpacity=".6"/>
              <rect x="1" y="5.5" width="3.5" height="3.5" rx="1" fill="white" fillOpacity=".6"/>
              <rect x="5.5" y="5.5" width="3.5" height="3.5" rx="1" fill="white" fillOpacity=".9"/>
            </svg>
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#6B7280' }}>Team Space</span>
        </button>

        {/* Chevron separator */}
        <svg fill="none" viewBox="0 0 6 10" width={5} height={8} style={{ color: '#D1D5DB', flexShrink: 0 }}>
          <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>

        {selectedProject ? (
          <>
            <button
              type="button"
              onClick={() => onProjectFilterChange('all')}
              style={{ fontSize: 13, fontWeight: 500, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#6B7280')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#9CA3AF')}
            >
              All Tasks
            </button>

            <svg fill="none" viewBox="0 0 6 10" width={5} height={8} style={{ color: '#D1D5DB', flexShrink: 0 }}>
              <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>

            {/* Current project — purple pill */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 999,
              background: '#F3F0FF', border: '1px solid #DDD6FE',
              fontSize: 12.5, fontWeight: 700, color: '#7B3FF2',
            }}>
              {selectedProject.displayName}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', padding: '4px 6px' }}>
            All Tasks
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* ── Stats badges ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ padding: '2px 9px', borderRadius: 999, background: '#F9FAFB', border: '1px solid #E5E7EB', fontSize: 11.5, fontWeight: 500, color: '#6B7280' }}>
            {totalCount} total
          </span>
          <span style={{ padding: '2px 9px', borderRadius: 999, background: '#F0FDF4', border: '1px solid #86EFAC', fontSize: 11.5, fontWeight: 600, color: '#16A34A' }}>
            {doneCount} done
          </span>
          <span style={{ padding: '2px 9px', borderRadius: 999, background: overdueCount > 0 ? '#FFF1F1' : '#F9FAFB', border: `1px solid ${overdueCount > 0 ? '#FECACA' : '#E5E7EB'}`, fontSize: 11.5, fontWeight: 600, color: overdueCount > 0 ? '#EF4444' : '#9CA3AF' }}>
            {overdueCount} overdue
          </span>
          <span style={{ padding: '2px 9px', borderRadius: 999, background: '#F5F3FF', border: '1px solid #DDD6FE', fontSize: 11.5, fontWeight: 600, color: '#7B3FF2' }}>
            {totalCount - doneCount} remaining
          </span>
        </div>

        {/* Refresh */}
        <button
          type="button"
          onClick={onRefresh}
          title="Refresh"
          aria-label="Refresh task list"
          style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, background: 'none', border: '1px solid transparent', cursor: 'pointer', color: '#C4CACF',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.color = '#9CA3AF' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#C4CACF' }}
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 16 16" width={13} height={13}
            style={{ animation: isLoading ? 'spin 0.8s linear infinite' : 'none' }}
          >
            <path d="M14 8A6 6 0 1 1 8 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M8 2l2.5 2.5L8 7"   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* ══ Tabs + Toolbar (single row 44px) ═══════════════════════════════ */}
      <div style={{
        height:     44,
        flexShrink: 0,
        display:    'flex',
        alignItems: 'center',
        padding:    '0 16px',
        gap:        2,
        background: 'white',
        borderBottom: '1px solid #F0F0F5',
      }}>

        {/* ── View tabs ── */}
        {TAB_ITEMS.map(({ label, to }) => (
          <NavLink
            key={to}
            to={projectFilter !== 'all' ? `${to}?project=${encodeURIComponent(projectFilter)}` : to}
            end={to === '/tasks'}
            style={{ textDecoration: 'none' }}
          >
            {({ isActive }) => (
              <div style={{
                display:      'flex',
                alignItems:   'center',
                height:       44,
                padding:      '0 11px',
                fontSize:     12.5,
                fontWeight:   isActive ? 600 : 400,
                color:        isActive ? '#7B3FF2' : '#6B7280',
                borderBottom: isActive ? '2px solid #7B3FF2' : '2px solid transparent',
                cursor:       'pointer',
                whiteSpace:   'nowrap',
                transition:   'color 120ms',
                marginBottom: -1,
              }}>
                {label}
              </div>
            )}
          </NavLink>
        ))}

        {/* Divider */}
        <div style={{ width: 1, height: 18, background: '#E5E7EB', margin: '0 8px', flexShrink: 0 }} />

        {/* ── Expand / Collapse (Tree view only) ── */}
        {onExpandAll && onCollapseAll && (
          <>
            <button type="button" onClick={onExpandAll} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 30, padding: '0 10px', borderRadius: 7, cursor: 'pointer',
              fontSize: 12, fontWeight: 400, color: '#6B7280',
              background: 'white', border: '1px solid #E5E7EB',
            }}>
              <svg fill="none" viewBox="0 0 14 14" width={11} height={11}>
                <path d="M7 2v10M2 7h5M9 7h3M12 4v6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
              </svg>
              Expand all
            </button>
            <button type="button" onClick={onCollapseAll} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 30, padding: '0 10px', borderRadius: 7, cursor: 'pointer',
              fontSize: 12, fontWeight: 400, color: '#6B7280',
              background: 'white', border: '1px solid #E5E7EB',
            }}>
              <svg fill="none" viewBox="0 0 14 14" width={11} height={11}>
                <path d="M2 7h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
              </svg>
              Collapse all
            </button>
          </>
        )}

        {/* ── Group dropdown ── */}
        {groupBy !== undefined && onGroupByChange && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              aria-label="Group tasks"
              aria-expanded={showGroupMenu}
              onClick={() => setShowGroupMenu((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                height: 30, padding: '0 10px', borderRadius: 7, cursor: 'pointer',
                fontSize: 12, fontWeight: groupBy !== 'none' ? 600 : 400,
                background: groupBy !== 'none' ? '#F3F0FF' : 'white',
                color:      groupBy !== 'none' ? '#7B3FF2' : '#6B7280',
                border:     groupBy !== 'none' ? '1px solid #C4B5FD' : '1px solid #E5E7EB',
                transition: 'all 120ms',
              }}
            >
              <svg aria-hidden="true" fill="none" viewBox="0 0 14 14" width={11} height={11}>
                <path d="M2 4h10M4 7h6M6 10h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
              </svg>
              {groupLabel}
              <svg aria-hidden="true" fill="none" viewBox="0 0 10 10" width={8} height={8} style={{ opacity: 0.5, marginLeft: 1 }}>
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3"/>
              </svg>
            </button>

            {showGroupMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowGroupMenu(false)} />
                <div style={{
                  position: 'absolute', top: 36, left: 0, zIndex: 50,
                  background: 'white', border: '1px solid #E5E7EB',
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.10)',
                  minWidth: 148, padding: '4px 0', overflow: 'hidden',
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '7px 12px 5px' }}>
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
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%', padding: '7px 12px', textAlign: 'left',
                        background: groupBy === opt.value ? '#F3F0FF' : 'transparent',
                        color:      groupBy === opt.value ? '#7B3FF2' : '#374151',
                        fontSize: 13, fontWeight: groupBy === opt.value ? 600 : 400,
                        border: 'none', cursor: 'pointer',
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

        {/* ── Filter ── */}
        <button type="button" aria-label="Filter tasks" style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 30, padding: '0 10px', borderRadius: 7, cursor: 'pointer',
          fontSize: 12, fontWeight: 400, color: '#6B7280',
          background: 'white', border: '1px solid #E5E7EB',
        }}>
          <svg aria-hidden="true" fill="none" viewBox="0 0 14 14" width={11} height={11}>
            <path d="M1 3h12M3 7h8M5.5 11h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
          </svg>
          Filter
        </button>

        {/* ── Sort ── */}
        <button type="button" aria-label="Sort tasks" style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 30, padding: '0 10px', borderRadius: 7, cursor: 'pointer',
          fontSize: 12, fontWeight: 400, color: '#6B7280',
          background: 'white', border: '1px solid #E5E7EB',
        }}>
          <svg aria-hidden="true" fill="none" viewBox="0 0 14 14" width={11} height={11}>
            <path d="M2 4h5M2 7h8M2 10h11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
          </svg>
          Sort
        </button>

        <div style={{ flex: 1 }} />

        {/* ── My Tasks ── */}
        <button
          type="button"
          onClick={() => onMyTasksOnlyChange(!myTasksOnly)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            height: 30, padding: '0 11px', borderRadius: 7, cursor: 'pointer',
            fontSize: 12, fontWeight: myTasksOnly ? 600 : 400,
            background: myTasksOnly ? '#F3F0FF' : 'white',
            color:      myTasksOnly ? '#7B3FF2' : '#6B7280',
            border:     myTasksOnly ? '1px solid #C4B5FD' : '1px solid #E5E7EB',
            transition: 'all 120ms',
          }}
        >
          <svg fill="none" viewBox="0 0 14 14" width={11} height={11}>
            <circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M2 12c1-2.5 3-4 5-4s4 1.5 5 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/>
          </svg>
          My Tasks
        </button>

        {/* ── Show / Hide Done ── */}
        <button
          type="button"
          onClick={() => onShowClosedChange(!showClosed)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            height: 30, padding: '0 11px', borderRadius: 7, cursor: 'pointer',
            fontSize: 12, fontWeight: showClosed ? 600 : 400,
            background: showClosed ? '#F0FDF4' : 'white',
            color:      showClosed ? '#15803D' : '#6B7280',
            border:     showClosed ? '1px solid #86EFAC' : '1px solid #E5E7EB',
            transition: 'all 120ms',
          }}
        >
          <svg fill="none" viewBox="0 0 14 14" width={11} height={11}>
            <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
          </svg>
          {showClosed ? 'Hide Done' : 'Show Done'}
        </button>

        {/* ── Add Task ── */}
        <button
          type="button"
          onClick={onAddTask}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 30, padding: '0 14px', borderRadius: 8,
            background: 'linear-gradient(135deg, #7B3FF2 0%, #6366F1 100%)',
            color: 'white', fontSize: 12.5, fontWeight: 600,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(123,63,242,.35)',
          }}
        >
          <svg fill="none" viewBox="0 0 12 12" width={10} height={10}>
            <path d="M6 1v10M1 6h10" stroke="white" strokeLinecap="round" strokeWidth="1.9"/>
          </svg>
          Add Task
        </button>
      </div>
    </>
  )
}
