import { WhatsNewModal } from '../WhatsNewModal';
import { FeedbackModal } from '../FeedbackModal';
import { AccountSheet } from './AccountSheet';
import type { Sheet } from '../../lib/mobileNav';

interface MobileOverlaysProps {
  /** The overlay in the current history entry, if any. */
  sheet: Sheet | null;
  /** Close the open overlay (history back, once). */
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenSheet: (kind: Sheet) => void;
  /** The control that opened the first overlay (account button, Folders footer); focus returns to it. */
  opener: Element | null;
}

const currentVersion = import.meta.env.VITE_APP_VERSION || '0.0.0';

/**
 * The overlays opened from the account menu, rendered by the shell from the history entry so system
 * back closes exactly the one on top. What's New and Share feedback replace the sheet's entry rather
 * than stacking inside it, so there is never a modal over a modal (WCAG 2.1.1, 2.1.2). Focus returns
 * to whatever opened the first overlay (the account button, or the Folders footer button).
 */
export function MobileOverlays({ sheet, onClose, onOpenSettings, onOpenSheet, opener }: MobileOverlaysProps) {
  return (
    <>
      <AccountSheet
        open={sheet === 'account'}
        returnFocusTo={opener}
        onClose={onClose}
        onOpenSettings={onOpenSettings}
        onOpenWhatsNew={() => onOpenSheet('whats-new')}
        onOpenFeedback={() => onOpenSheet('feedback')}
      />
      <WhatsNewModal
        isOpen={sheet === 'whats-new'}
        onClose={onClose}
        currentVersion={currentVersion}
        returnFocusTo={opener}
      />
      <FeedbackModal isOpen={sheet === 'feedback'} onClose={onClose} returnFocusTo={opener} />
    </>
  );
}
