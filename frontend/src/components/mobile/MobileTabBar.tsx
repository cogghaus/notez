import { CheckSquare, FileText, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { requestSearchFocus, type Tab } from '../../lib/mobileNav';

interface MobileTabBarProps {
  current: Tab;
  onSelect: (tab: Tab) => void;
}

const TABS: Array<{ tab: Tab; label: string; icon: LucideIcon }> = [
  { tab: 'notes', label: 'Notes', icon: FileText },
  { tab: 'tasks', label: 'Tasks', icon: CheckSquare },
  { tab: 'search', label: 'Search', icon: Search },
];

/**
 * Bottom tab bar below xl (spec 3.1): in flow at the bottom of the shell, safe-area padded.
 * Only rendered on list screens: the editor and pushed pages are full screen. `data-kb-hide` keeps
 * it out of the way in minimal writing mode.
 */
export function MobileTabBar({ current, onSelect }: MobileTabBarProps) {
  return (
    <nav
      aria-label="Primary"
      data-mobile-shell
      data-mobile-bottom-nav
      data-kb-hide
      className="flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex min-h-14">
        {TABS.map(({ tab, label, icon: Icon }) => {
          const active = tab === current;
          return (
            <button
              key={tab}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                if (tab === 'search' && !active) requestSearchFocus();
                onSelect(tab);
              }}
              className={`flex-1 min-h-12 flex flex-col items-center justify-center gap-0.5 py-1 ${
                active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <span
                className={`flex items-center justify-center w-14 h-7 rounded-full ${
                  active ? 'bg-blue-100 dark:bg-blue-900/40' : ''
                }`}
              >
                <Icon className="w-6 h-6" aria-hidden="true" />
              </span>
              <span className="text-xs font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
