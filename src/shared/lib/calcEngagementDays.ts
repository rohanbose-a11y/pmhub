/** Inclusive calendar-day count between two ISO date strings, or undefined if invalid/reversed. */
export function calcEngagementDays(start: string, due: string): number | undefined {
  if (!start || !due) return undefined
  const s = new Date(start)
  const d = new Date(due)
  if (isNaN(s.getTime()) || isNaN(d.getTime()) || d < s) return undefined
  return Math.round((d.getTime() - s.getTime()) / 86_400_000) + 1
}
