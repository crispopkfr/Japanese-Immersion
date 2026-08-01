import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, X } from 'lucide-react';
import { usePWA } from '../usePWA';

export function PWAStatusBanner() {
  const { isOnline, isUpdateAvailable, updateApp } = usePWA();
  const [showOfflineToast, setShowOfflineToast] = useState(false);
  const [hasDismissedOffline, setHasDismissedOffline] = useState(false);

  useEffect(() => {
    if (!isOnline && !hasDismissedOffline) {
      setShowOfflineToast(true);
    } else if (isOnline) {
      setShowOfflineToast(false);
      setHasDismissedOffline(false);
    }
  }, [isOnline, hasDismissedOffline]);

  return (
    <>
      {/* Offline Status Toast */}
      {showOfflineToast && (
        <div className="fixed bottom-4 left-4 z-50 bg-zinc-800/95 border border-amber-500/40 text-amber-200 px-3.5 py-2 rounded-md shadow-lg flex items-center gap-2.5 text-xs font-mono backdrop-blur animate-in fade-in slide-in-from-bottom-2">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <span>You are offline. Local entries and cached media remain fully accessible.</span>
          <button
            onClick={() => {
              setShowOfflineToast(false);
              setHasDismissedOffline(true);
            }}
            className="text-zinc-400 hover:text-white p-1 ml-1"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* App Update Available Toast */}
      {isUpdateAvailable && (
        <div className="fixed bottom-4 right-4 z-50 bg-zinc-900 border border-indigo-500/50 text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 text-xs font-sans backdrop-blur animate-in fade-in slide-in-from-bottom-2">
          <div className="flex flex-col">
            <span className="font-semibold text-indigo-300">New version available</span>
            <span className="text-zinc-400 text-[11px]">Click update to apply changes</span>
          </div>
          <button
            onClick={updateApp}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs rounded transition-colors flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Update Now</span>
          </button>
        </div>
      )}
    </>
  );
}
