import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function InstallAppButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showFallbackHelp, setShowFallbackHelp] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!installEvent) {
      setShowFallbackHelp(true)
      return
    }

    await installEvent.prompt()
    const choice = await installEvent.userChoice

    if (choice.outcome === 'accepted') {
      setInstallEvent(null)
      setShowFallbackHelp(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        className="w-full py-2.5 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
        onClick={handleInstallClick}
        type="button"
      >
        {installEvent ? 'Install app' : 'Add to Home Screen'}
      </button>

      {showFallbackHelp ? (
        <p className="text-xs text-slate-400 text-center">
          Open in Chrome or Safari → browser menu →{' '}
          <strong className="text-slate-600">Add to Home Screen</strong>
        </p>
      ) : null}
    </div>
  )
}
