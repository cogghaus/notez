import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Bug, Lightbulb, Send, CheckCircle, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { useFocusTrap } from '../lib/useFocusTrap';
import { useToast } from './Toast';
import { feedbackApi, type FeedbackType, type FeedbackCategory, type FeedbackPriority } from '../lib/api';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where focus goes on close, when it is not the element focused at open (mobile overlays). */
  returnFocusTo?: Element | null;
}

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'ui', label: 'User Interface' },
  { value: 'editor', label: 'Note Editor' },
  { value: 'ai', label: 'AI Features' },
  { value: 'organization', label: 'Organization' },
  { value: 'other', label: 'Other' },
];

const PRIORITIES: { value: FeedbackPriority; label: string; description: string }[] = [
  { value: 'nice-to-have', label: 'Nice to Have', description: 'Would be cool someday' },
  { value: 'helpful', label: 'Helpful', description: 'Would improve my workflow' },
  { value: 'critical', label: 'Critical', description: 'Really need this!' },
];

function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    // Server responded with an error status
    const msg = error.response?.data?.message;
    if (msg && typeof msg === 'string') {
      return msg.slice(0, 200);
    }
    // Network error (no response)
    if (!error.response) {
      return 'Network error — please check your connection and try again.';
    }
    return `Server error (${error.response.status}). Please try again.`;
  }
  if (error instanceof Error) {
    return error.message.slice(0, 200);
  }
  return 'Something went wrong. Please try again.';
}

export function FeedbackModal({ isOpen, onClose, returnFocusTo }: FeedbackModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const { showToast } = useToast();

  const [type, setType] = useState<FeedbackType>('FEATURE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<FeedbackCategory | ''>('');
  const [priority, setPriority] = useState<FeedbackPriority | ''>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The timer and a late response must act on the modal as it is now, not as it was when they started
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Cleanup timer on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const submitMutation = useMutation({
    mutationFn: () =>
      feedbackApi.submit({
        type,
        title,
        description,
        category: category || undefined,
        priority: priority || undefined,
      }),
    onSuccess: () => {
      if (!isOpenRef.current) {
        // Closed (system back) while sending: it was sent, so the draft goes; say so with a toast
        resetForm();
        showToast('Feedback sent', 'success');
        return;
      }
      setShowSuccess(true);
      // Close after a short delay, but only if it is still open then (system back may have closed it)
      closeTimerRef.current = setTimeout(() => {
        if (!isOpenRef.current) return;
        resetForm();
        onCloseRef.current();
      }, 2000);
    },
    onError: (error: unknown) => {
      if (!isOpenRef.current) {
        // Failed after the modal was closed: nothing to show it in, so say so and keep the draft
        submitMutation.reset();
        showToast('Feedback was not sent. Open Share feedback to try again.', 'error');
        return;
      }
      if (import.meta.env.DEV) {
        console.error('[FeedbackModal] Submit failed:', error);
      }
      // Error displayed via inline role="alert" block in the form (submitMutation.isError)
    },
  });

  const resetForm = () => {
    setType('FEATURE');
    setTitle('');
    setDescription('');
    setCategory('');
    setPriority('');
    setShowSuccess(false);
    submitMutation.reset();
  };

  // Closing without sending (X, Escape, backdrop, back) keeps the draft for the session; it is
  // cleared only after a successful send
  const handleClose = () => {
    if (submitMutation.isPending) return;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (showSuccess) resetForm();
    else submitMutation.reset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && description.trim()) {
      submitMutation.mutate();
    }
  };

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    // Using mousedown instead of click prevents issues with text selection
    // When user drags to select text and mouseup lands on backdrop, click fires
    // but mousedown only fires if the click started on the backdrop
    if (e.target === e.currentTarget && !submitMutation.isPending) {
      handleClose();
    }
  };

  useFocusTrap(dialogRef, isOpen, { opener: returnFocusTo });

  // Focus starts on the heading (Tab reaches the controls next); Escape closes unless a submit is running
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose; // handleClose ignores the call while a submit is pending
  useEffect(() => {
    if (!isOpen) return;
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // Closed from outside (system back) during the thanks screen: stop the timer, drop the sent draft
  useEffect(() => {
    if (isOpen) return;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (showSuccess) resetForm();
    else submitMutation.reset(); // a send that fails after the close must not reopen with a stale error
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // The submit button is gone once the thanks screen shows: move focus to its heading (announced as
  // the dialog's name) instead of letting it fall to <body>
  useEffect(() => {
    if (showSuccess) successRef.current?.focus();
  }, [showSuccess]);

  if (!isOpen) return null;

  const isBug = type === 'BUG';

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onMouseDown={handleBackdropMouseDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={showSuccess ? 'feedback-success-title' : 'feedback-title'}
    >
      {/* Height follows the visible viewport (--app-h) so Send stays reachable with the keyboard up and at 200% text */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[calc(var(--app-h,100dvh)-2rem)] animate-in fade-in zoom-in-95 duration-200">
        {showSuccess ? (
          // Success State
          <div className="p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3
              id="feedback-success-title"
              ref={successRef}
              tabIndex={-1}
              className="text-xl font-semibold text-gray-900 dark:text-white mb-2 focus:outline-none"
            >
              Thanks for your feedback!
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              We&apos;ve received your {isBug ? 'bug report' : 'suggestion'} and will review it soon.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2
                  id="feedback-title"
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-lg font-semibold text-gray-900 dark:text-white focus:outline-none"
                >
                  Share Your Feedback
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Help us make Notez better for you
                </p>
              </div>
              <button
                onClick={handleClose}
                disabled={submitMutation.isPending}
                aria-label="Close"
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain">
            {/* Type Toggle */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={isBug}
                  onClick={() => setType('BUG')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                    isBug
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 ring-2 ring-red-500'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Bug className="w-5 h-5" />
                  <span>Report a Problem</span>
                </button>
                <button
                  type="button"
                  aria-pressed={!isBug}
                  onClick={() => setType('FEATURE')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                    !isBug
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Lightbulb className="w-5 h-5" />
                  <span>Suggest Something</span>
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Title */}
              <div>
                <label htmlFor="feedback-title-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {isBug ? 'What went wrong?' : 'What would help?'}
                </label>
                <input
                  id="feedback-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  placeholder={isBug ? 'e.g., Editor crashes when pasting images' : 'e.g., Add dark mode scheduling'}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  disabled={submitMutation.isPending}
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 text-right mt-1">
                  {title.length}/100
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="feedback-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {isBug ? 'Tell us more about the issue' : 'Describe your idea'}
                </label>
                <textarea
                  id="feedback-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  placeholder={
                    isBug
                      ? 'What were you doing when it happened? What did you expect to happen?'
                      : 'How would this feature help you? What problem would it solve?'
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  required
                  disabled={submitMutation.isPending}
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 text-right mt-1">
                  {description.length}/1000
                </div>
              </div>

              {/* Category & Priority Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="feedback-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Category (optional)
                  </label>
                  <select
                    id="feedback-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={submitMutation.isPending}
                  >
                    <option value="">Select...</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="feedback-priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {isBug ? 'Severity' : 'Priority'} (optional)
                  </label>
                  <select
                    id="feedback-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as FeedbackPriority)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={submitMutation.isPending}
                  >
                    <option value="">Select...</option>
                    {PRIORITIES.map((pri) => (
                      <option key={pri.value} value={pri.value}>
                        {pri.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Error Message */}
              {submitMutation.isError && (
                <div role="alert" className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{extractErrorMessage(submitMutation.error)}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!title.trim() || !description.trim() || submitMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
              >
                {submitMutation.isPending ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>Send Feedback</span>
                  </>
                )}
              </button>
            </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
