import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useFocusTrap } from '../lib/useFocusTrap';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
}

interface ConfirmProviderProps {
  children: ReactNode;
}

export function ConfirmProvider({ children }: ConfirmProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: '',
    message: '',
  });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const triggerRef = useRef<Element | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    triggerRef.current = document.activeElement;
    setOptions(opts);
    setIsOpen(true);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  // Tab cycling inside the dialog and focus restoration to the opener on close (spec 9.6)
  useFocusTrap(dialogRef, isOpen, { opener: triggerRef.current });

  const handleConfirm = () => {
    setIsOpen(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  };

  const handleCancel = () => {
    setIsOpen(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  };

  // Using mousedown instead of click prevents issues with text selection.
  // When user drags to select text and mouseup lands on backdrop, click fires
  // but mousedown only fires if the click started on the backdrop.
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const { title, message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'default' } = options;

  const variantStyles = {
    danger: {
      icon: <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />,
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      confirmBtn: 'bg-red-600 hover:bg-red-700 text-white',
    },
    warning: {
      icon: <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
    default: {
      icon: <AlertTriangle className="w-6 h-6 text-blue-600 dark:text-blue-400" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      confirmBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
  };

  const styles = variantStyles[variant];

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onMouseDown={handleBackdropMouseDown}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div
            ref={dialogRef}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Header */}
            <div className="flex items-start gap-4 p-6 pb-4">
              <div className={`flex-shrink-0 p-3 rounded-full ${styles.iconBg}`}>
                {styles.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  id="confirm-title"
                  className="text-lg font-semibold text-gray-900 dark:text-white"
                >
                  {title}
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {message}
                </p>
              </div>
              <button
                onClick={handleCancel}
                aria-label="Close"
                className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900/50">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={handleConfirm}
                autoFocus
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${styles.confirmBtn}`}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
