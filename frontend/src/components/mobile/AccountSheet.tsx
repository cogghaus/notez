import { useEffect, useRef, useState } from 'react';
import { LogOut, MessageSquare, Moon, Settings, Sparkles, Sun } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { WhatsNewModal } from '../WhatsNewModal';
import { FeedbackModal } from '../FeedbackModal';

interface AccountSheetProps {
  open: boolean;
  /** Close the sheet (history back; the sheet is a history entry). */
  onClose: () => void;
  onOpenSettings: () => void;
}

const ROW =
  'w-full min-h-12 px-4 flex items-center gap-3 text-base text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700';

/**
 * Account bottom sheet (spec 3.4): username header, Theme, Settings, What's New, Share feedback (the
 * old header menu had it, so phones keep a way in), Sign out.
 * `role="dialog" aria-modal`, focus trapped, Escape and a backdrop tap close it, focus returns to
 * the opener. Closing goes through history, so system back closes it too.
 */
export function AccountSheet({ open, onClose, onOpenSettings }: AccountSheetProps) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const sheetRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const currentVersion = import.meta.env.VITE_APP_VERSION || '0.0.0';

  useFocusTrap(sheetRef, open);

  // Informational heading first: screen readers announce the user, Tab moves to the first row
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  // Escape closes the sheet from wherever focus is (not while a modal is on top of it)
  useEffect(() => {
    if (!open || showWhatsNew || showFeedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, showWhatsNew, showFeedback, onClose]);

  if (!open || !user) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-sheet-title"
          className="w-full max-h-[85%] overflow-y-auto overscroll-contain bg-white dark:bg-gray-800 rounded-t-2xl shadow-xl pb-[env(safe-area-inset-bottom)]"
        >
          <div className="px-4 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700">
            <h2
              id="account-sheet-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-lg font-semibold text-gray-900 dark:text-white break-words focus:outline-none"
            >
              {user.username}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{user.role === 'admin' ? 'Administrator' : 'User'}</p>
          </div>

          <div className="min-h-12 px-4 flex items-center justify-between gap-3">
            <span className="text-base text-gray-900 dark:text-gray-100">Theme</span>
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map((value) => {
                const Icon = value === 'light' ? Sun : Moon;
                const selected = theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTheme(value)}
                    className={`min-h-12 px-4 flex items-center gap-2 rounded-lg border text-base ${
                      selected
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-500'
                    }`}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                    {value === 'light' ? 'Light' : 'Dark'}
                  </button>
                );
              })}
            </div>
          </div>

          <button type="button" className={ROW} onClick={onOpenSettings}>
            <Settings className="w-5 h-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            Settings
          </button>
          <button type="button" className={ROW} onClick={() => setShowWhatsNew(true)}>
            <Sparkles className="w-5 h-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            What&apos;s New
          </button>
          <button type="button" className={ROW} onClick={() => setShowFeedback(true)}>
            <MessageSquare className="w-5 h-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            Share feedback
          </button>
          <button
            type="button"
            className={`${ROW} border-t border-gray-200 dark:border-gray-700 !text-red-700 dark:!text-red-400`}
            onClick={() => {
              void logout();
            }}
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>

      <WhatsNewModal isOpen={showWhatsNew} onClose={() => setShowWhatsNew(false)} currentVersion={currentVersion} />
      <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />
    </>
  );
}
