import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { Project } from '../../projects/types/project.types'
import { ProjectInfoDrawer } from '../../projects/components/ProjectInfoDrawer'
import { useAuthStore } from '../../../store/authStore'
import type { AddNewType } from '../types/task.types'
import { useKraOptions } from '../../../hooks/useKraOptions'

export type { AddNewType }  // re-export so existing imports from this file keep working

// ── Role-gated "Add New" menu items ──────────────────────────────────────────
// Each item lists every role allowed to see it. Task is the floor — everyone
// with any recognised project role gets it. Falls back to Task-only if the
// user has no recognised role.


export interface TaskFilters {
  statuses:      string[]
  dateFrom:      string
  dateTo:        string
  activityTypes: string[]
}

export const EMPTY_FILTERS: TaskFilters = { statuses: [], dateFrom: '', dateTo: '', activityTypes: [] }

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
  onAddNew:              (type: AddNewType) => void
  groupBy?:              'status' | 'none'
  onGroupByChange?:      (v: 'status' | 'none') => void
  filters?:              TaskFilters
  onFiltersChange?:      (f: TaskFilters) => void
}

const TAB_ITEMS = [
  { label: 'Tree',  to: '/tasks' },
  { label: 'Board', to: '/tasks/kanban' },
  { label: 'Gantt', to: '/tasks/gantt' },
]

const STATUS_OPTIONS = ['Open', 'Working', 'Pending Review', 'Overdue', 'Completed', 'Cancelled']

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
  onAddNew,
  groupBy,
  onGroupByChange,
  filters = EMPTY_FILTERS,
  onFiltersChange,
}: TasksHeaderProps) {
  const [showGroupMenu,    setShowGroupMenu]    = useState(false)
  const [showFilterPanel,  setShowFilterPanel]  = useState(false)
  const [statusSearch,     setStatusSearch]     = useState('')
  const [showStatusList,   setShowStatusList]   = useState(false)
  const [activitySearch,   setActivitySearch]   = useState('')
  const [showActivityList, setShowActivityList] = useState(false)
  const [infoSlug,         setInfoSlug]         = useState<string | null>(null)
  const { options: activityTypes } = useKraOptions()

  const filteredActivityTypes = activityTypes.filter((a) =>
    !activitySearch || a.toLowerCase().includes(activitySearch.toLowerCase())
  )

  const isFiltered = filters.statuses.length > 0 || !!filters.dateFrom || !!filters.dateTo || filters.activityTypes.length > 0

  const fmtChipDate = (d: string) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' }) : '…'

  const toggle = <K extends keyof Pick<TaskFilters, 'statuses' | 'activityTypes'>>(key: K, val: string) => {
    if (!onFiltersChange) return
    const cur = filters[key] as string[]
    onFiltersChange({ ...filters, [key]: cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val] })
  }

  const userRoles = useAuthStore((s) => s.user?.roles ?? [])

  const selectedProject = projects.find((p) => p.slug === projectFilter)

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

        {/* Projects root */}
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
          <span style={{ fontSize: 13, fontWeight: 500, color: '#6B7280' }}>Projects</span>
        </button>

        {/* Chevron */}
        <svg fill="none" viewBox="0 0 6 10" width={5} height={8} style={{ color: '#D1D5DB', flexShrink: 0 }}>
          <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>

        {selectedProject ? (
          /* Projects > {Project} */
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 999,
              background: '#F3F0FF', border: '1px solid #DDD6FE',
              fontSize: 12.5, fontWeight: 700, color: '#7B3FF2',
            }}>
              {selectedProject.displayName}
            </span>
            <button
              type="button"
              onClick={() => setInfoSlug(selectedProject.slug)}
              title="Project details"
              aria-label="Show project details"
              style={{
                width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 999, background: 'none', border: 'none', cursor: 'pointer',
                color: '#7B3FF2', opacity: 0.7, transition: 'all 120ms', flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F3F0FF'; e.currentTarget.style.opacity = '1' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.opacity = '0.7' }}
            >
              <svg fill="none" viewBox="0 0 16 16" width={13} height={13}>
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 7.2v3.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                <circle cx="8" cy="5" r="0.9" fill="currentColor"/>
              </svg>
            </button>
          </div>
        ) : (
          /* Projects > All Tasks */
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
        {onFiltersChange && (
          <>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                aria-label="Filter tasks"
                aria-expanded={showFilterPanel}
                onClick={() => setShowFilterPanel((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  height: 28, padding: '0 10px', borderRadius: 7, cursor: 'pointer',
                  fontSize: 12, fontWeight: isFiltered ? 600 : 400,
                  background: isFiltered ? '#F3F0FF' : 'white',
                  color:      isFiltered ? '#7B3FF2' : '#6B7280',
                  border:     isFiltered ? '1px solid #C4B5FD' : '1px solid #E5E7EB',
                  transition: 'all 120ms',
                }}
              >
                <svg aria-hidden="true" fill="none" viewBox="0 0 14 14" width={11} height={11}>
                  <path d="M2 4h10M4 7h6M6 10h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
                </svg>
                Filter
                {isFiltered && (
                  <span style={{ minWidth: 16, height: 16, borderRadius: 8, background: '#7B3FF2', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                    {filters.statuses.length + filters.activityTypes.length + (filters.dateFrom || filters.dateTo ? 1 : 0)}
                  </span>
                )}
              </button>

              {showFilterPanel && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => { setShowFilterPanel(false); setShowStatusList(false); setStatusSearch(''); setShowActivityList(false); setActivitySearch('') }} />
                  <div style={{ position: 'absolute', top: 36, left: 0, zIndex: 50, background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,.09), 0 1px 4px rgba(0,0,0,.05)', width: 660 }}>

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid #F3F4F6' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', flex: 1 }}>Filter by</span>
                      {isFiltered && (
                        <button type="button"
                          onClick={() => { onFiltersChange(EMPTY_FILTERS); setStatusSearch(''); setShowStatusList(false); setActivitySearch(''); setShowActivityList(false) }}
                          style={{ fontSize: 11.5, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: '2px 6px', borderRadius: 5, transition: 'color 100ms' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#6B7280')}
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {/* 3-column body */}
                    <div style={{ display: 'flex', alignItems: 'stretch' }}>

                      {/* Col 1 — Status */}
                      <div style={{ flex: 1, padding: '14px 16px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: '#6B7280', letterSpacing: '0.04em' }}>Status</span>
                          {filters.statuses.length > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#7B3FF2', background: '#F3F0FF', borderRadius: 999, padding: '0 6px', lineHeight: '18px' }}>{filters.statuses.length}</span>
                          )}
                        </div>
                        {/* tag input */}
                        <div
                          style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minHeight: 36, padding: '4px 8px', borderRadius: 7, border: `1px solid ${showStatusList ? '#7B3FF2' : '#D1D5DB'}`, cursor: 'text', transition: 'border-color 150ms, box-shadow 150ms', boxShadow: showStatusList ? '0 0 0 3px rgba(123,63,242,.1)' : 'none' }}
                          onClick={() => setShowStatusList(true)}
                        >
                          {filters.statuses.map((s) => (
                            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 4px 2px 7px', borderRadius: 5, background: '#F3F0FF', border: '1px solid #DDD6FE', fontSize: 11, fontWeight: 500, color: '#5B21B6', lineHeight: 1.4 }}>
                              {s}
                              <button type="button" onClick={(e) => { e.stopPropagation(); toggle('statuses', s) }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9B72F0', padding: 0, fontSize: 14, lineHeight: 1 }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = '#DC2626')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = '#9B72F0')}
                              >×</button>
                            </span>
                          ))}
                          <input
                            type="text" value={statusSearch}
                            onChange={(e) => { setStatusSearch(e.target.value); setShowStatusList(true) }}
                            onFocus={() => setShowStatusList(true)}
                            placeholder={filters.statuses.length === 0 ? 'Search…' : ''}
                            style={{ flex: 1, minWidth: 50, border: 'none', outline: 'none', fontSize: 12, color: '#374151', background: 'transparent', height: 22, padding: 0 }}
                          />
                        </div>
                        {showStatusList && (() => {
                          const opts = STATUS_OPTIONS.filter((s) => !filters.statuses.includes(s) && (!statusSearch || s.toLowerCase().includes(statusSearch.toLowerCase())))
                          return opts.length > 0 ? (
                            <div style={{ marginTop: 5, paddingTop: 2, maxHeight: 148, overflowY: 'auto' }}>
                              {opts.map((s) => (
                                <button key={s} type="button"
                                  onClick={() => { toggle('statuses', s); setStatusSearch('') }}
                                  style={{ display: 'block', width: '100%', padding: '6px 8px', borderRadius: 6, textAlign: 'left', background: 'transparent', color: '#374151', fontSize: 12.5, border: 'none', cursor: 'pointer' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F3FF'; e.currentTarget.style.color = '#5B21B6' }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#374151' }}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          ) : null
                        })()}
                      </div>

                      <div style={{ width: 1, background: '#F3F4F6', flexShrink: 0 }} />

                      {/* Col 2 — Due Date */}
                      <div style={{ flex: 1, padding: '14px 16px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: '#6B7280', letterSpacing: '0.04em' }}>Due Date</span>
                          {(filters.dateFrom || filters.dateTo) && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#7B3FF2', background: '#F3F0FF', borderRadius: 999, padding: '0 6px', lineHeight: '18px' }}>set</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {([['From', 'dateFrom'], ['To', 'dateTo']] as const).map(([label, key]) => (
                            <div key={key}>
                              <label style={{ fontSize: 11, color: '#9CA3AF', display: 'block', marginBottom: 4 }}>{label}</label>
                              <input type="date" value={filters[key]}
                                onChange={(e) => onFiltersChange({ ...filters, [key]: e.target.value })}
                                style={{ width: '100%', height: 32, padding: '0 8px', borderRadius: 7, border: `1px solid ${filters[key] ? '#7B3FF2' : '#D1D5DB'}`, fontSize: 12, color: filters[key] ? '#5B21B6' : '#374151', background: 'white', outline: 'none', boxSizing: 'border-box', fontWeight: filters[key] ? 500 : 400 }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = '#7B3FF2'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(123,63,242,.1)' }}
                                onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = e.currentTarget.value ? '#7B3FF2' : '#D1D5DB' }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ width: 1, background: '#F3F4F6', flexShrink: 0 }} />

                      {/* Col 3 — Activity Type */}
                      <div style={{ flex: 1, padding: '14px 16px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: '#6B7280', letterSpacing: '0.04em' }}>Activity Type</span>
                          {filters.activityTypes.length > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#7B3FF2', background: '#F3F0FF', borderRadius: 999, padding: '0 6px', lineHeight: '18px' }}>{filters.activityTypes.length}</span>
                          )}
                        </div>
                        {/* tag input */}
                        <div
                          style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minHeight: 36, padding: '4px 8px', borderRadius: 7, border: `1px solid ${showActivityList ? '#7B3FF2' : '#D1D5DB'}`, cursor: 'text', transition: 'border-color 150ms, box-shadow 150ms', boxShadow: showActivityList ? '0 0 0 3px rgba(123,63,242,.1)' : 'none' }}
                          onClick={() => setShowActivityList(true)}
                        >
                          {filters.activityTypes.map((a) => (
                            <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 4px 2px 7px', borderRadius: 5, background: '#F3F0FF', border: '1px solid #DDD6FE', fontSize: 11, fontWeight: 500, color: '#5B21B6', lineHeight: 1.4, maxWidth: 120, overflow: 'hidden' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a}</span>
                              <button type="button" onClick={(e) => { e.stopPropagation(); toggle('activityTypes', a) }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9B72F0', padding: 0, fontSize: 14, lineHeight: 1, flexShrink: 0 }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = '#DC2626')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = '#9B72F0')}
                              >×</button>
                            </span>
                          ))}
                          <input
                            type="text" value={activitySearch}
                            onChange={(e) => { setActivitySearch(e.target.value); setShowActivityList(true) }}
                            onFocus={() => setShowActivityList(true)}
                            placeholder={filters.activityTypes.length === 0 ? 'Search…' : ''}
                            style={{ flex: 1, minWidth: 50, border: 'none', outline: 'none', fontSize: 12, color: '#374151', background: 'transparent', height: 22, padding: 0 }}
                          />
                        </div>
                        {showActivityList && (() => {
                          const opts = filteredActivityTypes.filter((a) => !filters.activityTypes.includes(a))
                          return activityTypes.length === 0 ? (
                            <p style={{ fontSize: 12, color: '#9CA3AF', margin: '8px 0 0' }}>Loading…</p>
                          ) : opts.length > 0 ? (
                            <div style={{ marginTop: 5, paddingTop: 2, maxHeight: 148, overflowY: 'auto' }}>
                              {opts.map((a) => (
                                <button key={a} type="button"
                                  onClick={() => { toggle('activityTypes', a); setActivitySearch('') }}
                                  style={{ display: 'block', width: '100%', padding: '6px 8px', borderRadius: 6, textAlign: 'left', background: 'transparent', color: '#374151', fontSize: 12.5, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F3FF'; e.currentTarget.style.color = '#5B21B6' }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#374151' }}
                                >
                                  {a}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p style={{ fontSize: 12, color: '#9CA3AF', margin: '8px 0 0' }}>No matches</p>
                          )
                        })()}
                      </div>

                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Active filter chips */}
            {filters.statuses.map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 22, padding: '0 4px 0 8px', borderRadius: 999, background: '#F3F0FF', border: '1px solid #C4B5FD', fontSize: 11, fontWeight: 500, color: '#7B3FF2', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {s}
                <button type="button" onClick={() => toggle('statuses', s)} aria-label={`Remove ${s} filter`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 999, background: 'none', border: 'none', cursor: 'pointer', color: '#9B72F0', padding: 0, fontSize: 14, lineHeight: 1 }}>
                  ×
                </button>
              </span>
            ))}
            {(filters.dateFrom || filters.dateTo) && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 22, padding: '0 4px 0 8px', borderRadius: 999, background: '#F3F0FF', border: '1px solid #C4B5FD', fontSize: 11, fontWeight: 500, color: '#7B3FF2', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {fmtChipDate(filters.dateFrom)} – {fmtChipDate(filters.dateTo)}
                <button type="button" onClick={() => onFiltersChange({ ...filters, dateFrom: '', dateTo: '' })} aria-label="Remove date filter"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 999, background: 'none', border: 'none', cursor: 'pointer', color: '#9B72F0', padding: 0, fontSize: 14, lineHeight: 1 }}>
                  ×
                </button>
              </span>
            )}
            {filters.activityTypes.map((a) => (
              <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 22, padding: '0 4px 0 8px', borderRadius: 999, background: '#F3F0FF', border: '1px solid #C4B5FD', fontSize: 11, fontWeight: 500, color: '#7B3FF2', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {a}
                <button type="button" onClick={() => toggle('activityTypes', a)} aria-label={`Remove ${a} filter`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 999, background: 'none', border: 'none', cursor: 'pointer', color: '#9B72F0', padding: 0, fontSize: 14, lineHeight: 1 }}>
                  ×
                </button>
              </span>
            ))}
          </>
        )}

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

        {/* ── New Milestone — Project Lead only ── */}
        {userRoles.includes('Project Lead') && (
          <button
            type="button"
            onClick={() => onAddNew('milestone')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 30, padding: '0 14px', borderRadius: 8,
              background: 'linear-gradient(135deg, #7B3FF2 0%, #6366F1 100%)',
              color: 'white', fontSize: 12.5, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(123,63,242,.35)',
            }}
          >
            <svg aria-hidden="true" fill="none" viewBox="0 0 12 12" width={10} height={10}>
              <path d="M6 1v10M1 6h10" stroke="white" strokeLinecap="round" strokeWidth="1.9"/>
            </svg>
            New Milestone
          </button>
        )}
      </div>

      {infoSlug && selectedProject && infoSlug === selectedProject.slug && (
        <ProjectInfoDrawer project={selectedProject} onClose={() => setInfoSlug(null)} />
      )}
    </>
  )
}
