import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { NotificationBell } from '../NotificationBell';
import { UserAvatar } from '../UserAvatar';
import { useAuth } from '../../contexts/AuthContext';

interface MobileTopBarProps {
  /** Screen title: "All notes" or the current folder, tag or view on Notes; "Tasks"; "Search". */
  title: string;
  /** Icon shown before the title on Notes. */
  titleIcon?: ReactNode;
  /** When set, the title is a button (Notes opens the Folders screen). Otherwise it is the h1. */
  onTitleClick?: () => void;
  onOpenAccount: () => void;
}

/**
 * Top bar of the list screens below xl (spec 3.4): account button at the left, title, notifications
 * at the right. Every control is at least 44px; the bell keeps its existing popover.
 */
export function MobileTopBar({ title, titleIcon, onTitleClick, onOpenAccount }: MobileTopBarProps) {
  const { user } = useAuth();

  return (
    <header
      data-mobile-shell
      data-kb-hide
      className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 pt-[env(safe-area-inset-top)]"
    >
      <div className="flex items-center gap-1 min-h-14 px-2">
        <button
          type="button"
          onClick={onOpenAccount}
          aria-label="Account menu"
          data-account-button
          aria-haspopup="dialog"
          className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          {user && <UserAvatar userId={user.userId} username={user.username} size="md" />}
        </button>

        <div className="flex-1 min-w-0">
          {onTitleClick ? (
            <h1>
              <button
                type="button"
                data-mobile-title
                onClick={onTitleClick}
                aria-label={`Filter notes, currently ${title}`}
                className="max-w-full min-h-12 px-3 flex items-center gap-2 rounded-lg text-lg font-semibold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {titleIcon}
                <span className="min-w-0 break-words text-left">{title}</span>
                <ChevronDown className="w-5 h-5 flex-shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
              </button>
            </h1>
          ) : (
            <h1 className="px-3 text-lg font-semibold text-gray-900 dark:text-white break-words">{title}</h1>
          )}
        </div>

        <NotificationBell buttonClassName="relative w-12 h-12 flex items-center justify-center rounded-full text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700" />
      </div>
    </header>
  );
}
