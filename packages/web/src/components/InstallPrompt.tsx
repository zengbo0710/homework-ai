import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-dismissed';

export function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!promptEvent || dismissed) return null;

  async function handleInstall() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setDismissed(true);
      localStorage.setItem(DISMISSED_KEY, 'true');
    }
  }

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, 'true');
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-indigo-600 text-white p-4 flex items-center justify-between gap-3 z-50 safe-area-inset-bottom">
      <div>
        <p className="font-semibold text-sm">Install HomeworkAI</p>
        <p className="text-xs text-indigo-200">Add to your home screen for quick access</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={handleInstall}
          className="bg-white text-indigo-600 text-sm font-semibold px-3 py-1.5 rounded-lg"
        >
          Install
        </button>
        <button onClick={handleDismiss} className="text-indigo-200 text-sm px-2" aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
