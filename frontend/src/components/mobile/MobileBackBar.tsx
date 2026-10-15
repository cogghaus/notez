import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface MobileBackBarProps {
  onBack: () => void;
  /** Page title, rendered as the page's h1. Omit for the editor, which has its own title. */
  title?: string;
  /** Extra controls on the right (each must be at least 44px). */
  trailing?: ReactNode;
  /** Hide in minimal writing mode (the editor's row), like the rest of the shell chrome. */
  hideWhileWriting?: boolean;
}

/**
 * Top row of a pushed screen (Folders, Settings, the editor): a 48px Back button, then the title.
 * The Back arrow is never a no-op; what it does at depth 0 is decided by useMobileNav().back.
 */
export function MobileBackBar({ onBack, title, trailing, hideWhileWriting = false }: MobileBackBarProps) {
  return (
    <header
      data-mobile-shell
      data-kb-hide={hideWhileWriting ? '' : undefined}
      className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 pt-[env(safe-area-inset-top)]"
    >
      <div className="flex items-center gap-1 min-h-12 px-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        {title && (
          <h1 className="flex-1 min-w-0 text-lg font-semibold text-gray-900 dark:text-white break-words">{title}</h1>
        )}
        {trailing}
      </div>
    </header>
  );
}
