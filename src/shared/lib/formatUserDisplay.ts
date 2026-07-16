/**
 * Converts a Frappe user identifier to a readable display name.
 * - If the value already looks like a full name (has a space, no @) → returned as-is
 * - If it is an email  (e.g. rohan.bose@sauramandala.org) → "Rohan Bose"
 * - Anything else → returned as-is
 */
export function formatUserDisplay(value: string | null | undefined): string {
  if (!value) return ''
  const v = value.trim()
  if (!v.includes('@')) return v          // already a name or plain username
  const namePart = v.split('@')[0]        // e.g. "rohan.bose"
  return namePart
    .split(/[._-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
