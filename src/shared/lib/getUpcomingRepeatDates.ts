import type { AutoRepeat, Weekday } from '../../api/autoRepeatApi'

type RepeatLike = Pick<AutoRepeat, 'frequency' | 'startDate' | 'endDate' | 'repeatOnDay' | 'repeatOnWeekdays'>

const DAY_IDX: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseLocal(s: string) {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function getUpcomingRepeatDates(repeat: RepeatLike, count = 5, holidays: Set<string> = new Set()): string[] {
  if (!repeat.startDate) return []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = parseLocal(repeat.startDate)
  const endDate = repeat.endDate ? parseLocal(repeat.endDate) : null
  const cursor = new Date(Math.max(start.getTime(), today.getTime()))
  const results: string[] = []
  const push = (d: Date) => { if (endDate && d > endDate) return false; results.push(localISO(d)); return true }
  const skipSunday = (d: Date) => { if (d.getDay() === 0) d.setDate(d.getDate() + 1) }

  if (repeat.frequency === 'Daily') {
    const d = new Date(cursor)
    while (results.length < count) {
      if (d.getDay() !== 0) { if (!push(new Date(d))) break }
      d.setDate(d.getDate() + 1)
    }
    return results
  }
  if (repeat.frequency === 'Weekly') {
    const targets = repeat.repeatOnWeekdays.length > 0
      ? repeat.repeatOnWeekdays.map((w) => DAY_IDX.indexOf(w))
      : [start.getDay()]
    const d = new Date(cursor)
    let guard = 365
    while (results.length < count && guard-- > 0) {
      if (targets.includes(d.getDay())) { if (!push(new Date(d))) break }
      d.setDate(d.getDate() + 1)
    }
    return results
  }
  const step = repeat.frequency === 'Monthly' ? 1 : repeat.frequency === 'Quarterly' ? 3 : repeat.frequency === 'Half-yearly' ? 6 : 12
  const dom = repeat.repeatOnDay || start.getDate()
  let d = new Date(start.getFullYear(), start.getMonth(), dom)
  while (d < cursor) d = new Date(d.getFullYear(), d.getMonth() + step, dom)
  while (results.length < count) {
    let guard = 14
    while (guard-- > 0) {
      while (holidays.has(localISO(d))) d.setDate(d.getDate() + 1)
      if (d.getDay() !== 0) break
      skipSunday(d)
    }
    if (!push(new Date(d))) break
    d = new Date(d.getFullYear(), d.getMonth() + step, dom)
  }
  return results
}
