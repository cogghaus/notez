import { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronRight, Sparkles, Wrench, RefreshCw, Minus, Plus } from 'lucide-react';
import { changelog, type ChangelogEntry } from '../data/changelog';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersion: string;
}

const LAST_SEEN_VERSION_KEY = 'notez-last-seen-version';

export function getLastSeenVersion(): string | null {
  return localStorage.getItem(LAST_SEEN_VERSION_KEY);
}

export function setLastSeenVersion(version: string): void {
  localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
}

export function hasNewVersion(currentVersion: string): boolean {
  const lastSeen = getLastSeenVersion();
  if (!lastSeen) return true; // First time user
  return lastSeen !== currentVersion;
}

function ReleaseSection({ entry, isLatest = false }: { entry: ChangelogEntry; isLatest?: boolean }) {
  const hasAdded = entry.added && entry.added.length > 0;
  const hasFixed = entry.fixed && entry.fixed.length > 0;
  const hasChanged = entry.changed && entry.changed.length > 0;
  const hasRemoved = entry.removed && entry.removed.length > 0;

  return (
    <div className={`${isLatest ? '' : 'border-t border-gray-200 dark:border-gray-700 pt-4'}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`font-semibold ${isLatest ? 'text-lg text-blue-600 dark:text-blue-400' : 'text-base text-gray-700 dark:text-gray-300'}`}>
          v{entry.version}
          {isLatest && <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">Latest</span>}
        </h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">{entry.date}</span>
      </div>

      {hasAdded && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-sm font-medium mb-1.5">
            <Plus className="w-3.5 h-3.5" />
            <span>Added</span>
          </div>
          <ul className="space-y-1 ml-5">
            {entry.added!.map((item, idx) => (
              <li key={idx} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 mt-0.5 text-green-500 dark:text-green-400 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasFixed && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 text-sm font-medium mb-1.5">
            <Wrench className="w-3.5 h-3.5" />
            <span>Fixed</span>
          </div>
          <ul className="space-y-1 ml-5">
            {entry.fixed!.map((item, idx) => (
              <li key={idx} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                <Wrench className="w-3.5 h-3.5 mt-0.5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasChanged && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-sm font-medium mb-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Changed</span>
          </div>
          <ul className="space-y-1 ml-5">
            {entry.changed!.map((item, idx) => (
              <li key={idx} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                <RefreshCw className="w-3.5 h-3.5 mt-0.5 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasRemoved && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-sm font-medium mb-1.5">
            <Minus className="w-3.5 h-3.5" />
            <span>Removed</span>
          </div>
          <ul className="space-y-1 ml-5">
            {entry.removed!.map((item, idx) => (
              <li key={idx} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                <Minus className="w-3.5 h-3.5 mt-0.5 text-red-500 dark:text-red-400 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function WhatsNewModal({ isOpen, onClose, currentVersion }: WhatsNewModalProps) {
  const [showHistory, setShowHistory] = useState(false);

  // Mark version as seen when modal opens
  useEffect(() => {
    if (isOpen) {
      setLastSeenVersion(currentVersion);
    }
  }, [isOpen, currentVersion]);

  if (!isOpen) return null;

  const latestRelease = changelog[0];
  const previousReleases = changelog.slice(1);

  return (
    <>
      {/* Backdrop — uses mousedown to prevent text selection from closing */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="whats-new-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 id="whats-new-title" className="text-lg font-semibold text-gray-900 dark:text-white">What's New in Notez</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Version {currentVersion}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Current Release */}
            {latestRelease && (
              <ReleaseSection entry={latestRelease} isLatest />
            )}

            {/* Previous Releases (Collapsible) */}
            {previousReleases.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {showHistory ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span>Previous Releases ({previousReleases.length})</span>
                </button>

                {showHistory && (
                  <div className="mt-4 space-y-4">
                    {previousReleases.map((entry) => (
                      <ReleaseSection key={entry.version} entry={entry} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-lg">
            <div className="flex items-center justify-between">
              <a
                href="https://github.com/cogghaus/notez/blob/main/CHANGELOG.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                View full changelog on GitHub
              </a>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
