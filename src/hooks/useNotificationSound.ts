import { useCallback, useEffect, useRef } from 'react'

// Gate AudioContext on a real user gesture to satisfy browser autoplay policy.
let userHasInteracted = false
const markInteracted = () => { userHasInteracted = true }
document.addEventListener('click',   markInteracted, { once: true, capture: true })
document.addEventListener('keydown', markInteracted, { once: true, capture: true })

/**
 * Synthesises a short two-tone "ding" using the Web Audio API.
 * No audio file required — works fully offline in the PWA.
 */
function playDing() {
  if (!userHasInteracted) return
  try {
    const ctx = new AudioContext()

    const tones = [
      { freq: 880, start: 0, duration: 0.35 },
      { freq: 1108, start: 0.18, duration: 0.3 },
    ]

    tones.forEach(({ freq, start, duration }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start)

      gain.gain.setValueAtTime(0, ctx.currentTime + start)
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)

      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    })

    setTimeout(() => ctx.close(), 800)
  } catch {
    // AudioContext unavailable — fail silently
  }
}

/**
 * Plays a notification ding when new task IDs appear in the caller's set.
 *
 * @param myTaskIdsKey  Sorted comma-separated string of task IDs belonging to
 *                      the current user. Recomputed each time the task list
 *                      refreshes so new assignments are detected automatically.
 */
export function useNotificationSound(myTaskIdsKey: string) {
  const prevKey = useRef<string | null>(null)

  const play = useCallback(() => playDing(), [])

  useEffect(() => {
    if (prevKey.current === null) {
      // First load — record baseline without playing
      prevKey.current = myTaskIdsKey
      return
    }

    if (myTaskIdsKey !== prevKey.current) {
      const prevSet = new Set(prevKey.current.split(',').filter(Boolean))
      const hasNew = myTaskIdsKey
        .split(',')
        .filter(Boolean)
        .some((id) => !prevSet.has(id))

      if (hasNew) playDing()
    }

    prevKey.current = myTaskIdsKey
  }, [myTaskIdsKey])

  return play
}
