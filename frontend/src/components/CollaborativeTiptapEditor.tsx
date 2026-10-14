/**
 * Collaborative TipTap editor component.
 * Uses Yjs + Hocuspocus for real-time multi-user editing.
 * Content syncs via CRDT, not React state - no onChange callback needed.
 *
 * Architecture: Split into two components to eliminate race conditions.
 * - CollaborativeTiptapEditor (outer): manages provider/ydoc lifecycle, shows loading/error states
 * - CollabEditorContent (inner): only mounts when collaboration is fully ready,
 *   creates the editor ONCE with stable references — no deps array, no editor recreation
 *
 * Extensions come from the shared editorExtensions module to prevent config
 * divergence with the non-collaborative TiptapEditor.
 *
 * Collaboration plugins (ySyncPlugin, yUndoPlugin, yCursorPlugin) are imported
 * directly from @tiptap/y-tiptap and wrapped in a custom Extension. This avoids
 * two issues that caused the white-screen crash:
 * 1. @tiptap/extension-collaboration's options resolution losing the `fragment` config
 * 2. @tiptap/extension-collaboration-cursor depending on y-prosemirror (external),
 *    which conflicts with @tiptap/y-tiptap (internal TipTap fork) — both define
 *    ySyncPluginKey('y-sync') but as different PluginKey instances
 */
import { Component, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Extension } from '@tiptap/core';
import { useEditor, EditorContent } from '@tiptap/react';
import {
  ySyncPlugin,
  yUndoPlugin,
  yCursorPlugin,
  yUndoPluginKey,
  undo,
  redo,
} from '@tiptap/y-tiptap';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { WS_BASE_URL } from '../lib/api';
import { CollaborationPresence } from './CollaborationPresence';
import { getBaseExtensions, EDITOR_PROSE_CLASS } from './editorExtensions';
import { uploadImage } from '../api/images';
import { ImagePlus } from 'lucide-react';
import { useKeepCaretVisible } from '../lib/useKeepCaretVisible';
import './TiptapEditor.css';
import './CollaborationCursors.css';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validates CSS color values from remote awareness data to prevent CSS injection.
// Allows hex, hsl(), rgb(), and named colors only.
const SAFE_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|hsl\(\d{1,3},\s*\d{1,3}%,\s*\d{1,3}%\)|rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)|[a-zA-Z]{1,30})$/;
const FALLBACK_COLOR = '#999999';

function sanitizeColor(color: unknown): string {
  if (typeof color !== 'string') return FALLBACK_COLOR;
  return SAFE_COLOR_RE.test(color) ? color : FALLBACK_COLOR;
}

function sanitizeDisplayName(name: unknown): string {
  if (typeof name !== 'string') return 'Anonymous';
  return name.slice(0, 50);
}

interface CollaborativeTiptapEditorProps {
  noteId: string;
  disabled?: boolean;
  placeholder?: string;
  username?: string;
  userColor?: string;
}

/**
 * Creates a custom TipTap extension that wires up all Yjs collaboration plugins
 * (sync, undo, cursors) directly from @tiptap/y-tiptap.
 *
 * The fragment and provider are captured as closure variables — they are NOT
 * passed through TipTap's extension options system, which avoids the options
 * resolution bug that caused the original crash.
 */
function createCollaborationExtension(
  fragment: Y.XmlFragment,
  provider: HocuspocusProvider,
) {
  return Extension.create({
    name: 'yCollaboration',
    priority: 1000,

    addKeyboardShortcuts() {
      return {
        'Mod-z': () => {
          const state = this.editor.state;
          const undoManager = yUndoPluginKey.getState(state)?.undoManager;
          if (!undoManager || undoManager.undoStack.length === 0) return false;
          return undo(state);
        },
        'Mod-y': () => {
          const state = this.editor.state;
          const undoManager = yUndoPluginKey.getState(state)?.undoManager;
          if (!undoManager || undoManager.redoStack.length === 0) return false;
          return redo(state);
        },
        'Shift-Mod-z': () => {
          const state = this.editor.state;
          const undoManager = yUndoPluginKey.getState(state)?.undoManager;
          if (!undoManager || undoManager.redoStack.length === 0) return false;
          return redo(state);
        },
      };
    },

    addProseMirrorPlugins() {
      const awareness = provider.awareness;

      // Cursor renderer — sanitizes remote user data to prevent CSS injection.
      // cursorUser comes from Yjs awareness (remote peers), so all values are untrusted.
      const cursorBuilder = (cursorUser: { name: string; color: string }) => {
        const safeColor = sanitizeColor(cursorUser.color);
        const safeName = sanitizeDisplayName(cursorUser.name);

        const cursor = document.createElement('span');
        cursor.classList.add('collaboration-cursor__caret');
        cursor.setAttribute('style', `border-color: ${safeColor}`);
        const label = document.createElement('div');
        label.classList.add('collaboration-cursor__label');
        label.setAttribute('style', `background-color: ${safeColor}`);
        label.insertBefore(document.createTextNode(safeName), null);
        cursor.insertBefore(label, null);
        return cursor;
      };

      const plugins = [
        ySyncPlugin(fragment),
        yUndoPlugin(),
      ];

      if (awareness) {
        plugins.push(yCursorPlugin(awareness, { cursorBuilder }));
      }

      return plugins;
    },
  });
}

// ---------------------------------------------------------------------------
// Inner component: editor content. Only mounted when collaboration is ready.
// useEditor has NO deps array — the editor is created once with stable references.
// ---------------------------------------------------------------------------
interface CollabEditorContentProps {
  provider: HocuspocusProvider;
  ydoc: Y.Doc;
  disabled: boolean;
  placeholder: string;
  username: string;
  userColor: string;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

function CollabEditorContent({
  provider,
  ydoc,
  disabled,
  placeholder,
  username,
  userColor,
  connectionStatus,
}: CollabEditorContentProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(async (file: File): Promise<string | null> => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const result = await uploadImage(file);
      return result.url;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to upload image:', error);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  // Pre-create the Y.XmlFragment directly from the ydoc.
  // Memoized so re-renders don't produce unstable references.
  const fragment = useMemo(() => ydoc.getXmlFragment('default'), [ydoc]);

  // Create the collaboration extension with fragment captured in closure.
  // Note: useEditor has NO deps array, so the editor is created once.
  // Changes to username/userColor after mount are applied via the useEffect below,
  // not by recreating the extension.
  const collabExtension = useMemo(
    () => createCollaborationExtension(fragment, provider),
    [fragment, provider],
  );

  // Set local awareness state for cursor visibility to other users.
  // Separated from plugin init so it can react to username/color changes.
  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    awareness.setLocalStateField('user', { name: username, color: userColor });
    return () => {
      awareness.setLocalStateField('user', null);
    };
  }, [provider, username, userColor]);

  const editor = useEditor({
    extensions: [
      // Shared base extensions (StarterKit without undoRedo, TaskList, Link, etc.)
      ...getBaseExtensions({
        placeholder,
        onImageUpload: handleImageUpload,
        collaborative: true,
      }),
      // Custom collaboration extension wrapping ySyncPlugin + yUndoPlugin + yCursorPlugin
      collabExtension,
    ],
    editable: !disabled,
    editorProps: {
      attributes: {
        class: EDITOR_PROSE_CLASS,
      },
    },
  });

  // Keep the caret visible when the on-screen keyboard changes the visible height
  useKeepCaretVisible(editor);

  // Update editable state without recreating editor
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  // Handle file input for manual image upload
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    const MAX_SIZE = 10 * 1024 * 1024;
    const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!ALLOWED.includes(file.type)) {
      setUploadError('Only JPEG, PNG, GIF, and WebP images are supported.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError('Image must be smaller than 10 MB.');
      return;
    }

    setUploadError(null);
    const url = await handleImageUpload(file);
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    } else {
      setUploadError('Failed to upload image. Please try again.');
    }
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Connection status + Presence bar */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <CollaborationPresence provider={provider} />
        <div className="flex items-center gap-2 px-3 py-1.5 ml-auto" aria-live="polite" aria-atomic="true">
          {connectionStatus === 'connecting' && (
            <span className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" aria-hidden="true" />
              Connecting...
            </span>
          )}
          {connectionStatus === 'connected' && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
              Live
            </span>
          )}
          {connectionStatus === 'disconnected' && (
            <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
              Disconnected
            </span>
          )}

          {/* Image Upload Button */}
          {!disabled && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              title={isUploading ? 'Uploading...' : 'Upload image'}
              aria-label={isUploading ? 'Uploading image...' : 'Upload image to note'}
            >
              <ImagePlus className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Upload error feedback */}
      {uploadError && (
        <div className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800" role="alert">
          {uploadError}
          <button onClick={() => setUploadError(null)} className="ml-2 underline hover:no-underline">Dismiss</button>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* Hidden file input for image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Upload image to note"
        onChange={handleFileInputChange}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error boundary: catches crashes in the editor and shows a recovery UI
// instead of a white screen. The onRetry callback triggers a full remount.
// ---------------------------------------------------------------------------
interface EditorErrorBoundaryProps {
  onRetry: () => void;
  children: React.ReactNode;
}

interface EditorErrorBoundaryState {
  hasError: boolean;
}

class EditorErrorBoundary extends Component<EditorErrorBoundaryProps, EditorErrorBoundaryState> {
  state: EditorErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): EditorErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log unconditionally — crash errors should always be visible in devtools
    console.error('Collaborative editor crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col h-full items-center justify-center text-gray-500 dark:text-gray-400 gap-3" role="alert">
          <span className="w-3 h-3 rounded-full bg-red-500" aria-hidden="true" />
          <span className="text-sm font-medium text-red-600 dark:text-red-400">
            Editor failed to load
          </span>
          <span className="text-xs text-center max-w-xs">
            Something went wrong while opening the editor. Retrying usually fixes this.
          </span>
          <button
            autoFocus
            onClick={() => this.props.onRetry()}
            className="mt-2 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Outer component: manages provider/ydoc lifecycle, shows loading/error states.
// The inner editor component only mounts once collaboration is fully ready.
// ---------------------------------------------------------------------------
export function CollaborativeTiptapEditor({
  noteId,
  disabled = false,
  placeholder = 'Start writing collaboratively...',
  username,
  userColor,
}: CollaborativeTiptapEditorProps) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [isSynced, setIsSynced] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  // Latching state: once true, stays true for the lifetime of this provider instance.
  const [collaborationReady, setCollaborationReady] = useState(false);

  // Get fresh token for WebSocket auth
  const getToken = useCallback(() => {
    return localStorage.getItem('accessToken') || '';
  }, []);

  const isValidNoteId = UUID_RE.test(noteId);

  // Create Y.Doc + Hocuspocus provider.
  // The Y.Doc is created explicitly and owned by this component, NOT derived from the provider.
  useEffect(() => {
    if (!isValidNoteId) return;

    setIsSynced(false);
    setAuthFailed(false);
    setSyncTimedOut(false);
    setCollaborationReady(false);
    setConnectionStatus('connecting');

    const doc = new Y.Doc();
    const hocuspocusProvider = new HocuspocusProvider({
      url: `${WS_BASE_URL}/api/collaboration/${noteId}`,
      name: noteId,
      document: doc,
      token: getToken,
      onStatus: ({ status }) => {
        setConnectionStatus(status as 'connecting' | 'connected' | 'disconnected');
      },
      onSynced: ({ state }) => {
        if (state) {
          setCollaborationReady(true);
          setSyncTimedOut(false);
        }
        setIsSynced(state);
      },
      onAuthenticationFailed: () => {
        setAuthFailed(true);
        setConnectionStatus('disconnected');
        hocuspocusProvider.disconnect();
      },
    });

    setYdoc(doc);
    setProvider(hocuspocusProvider);

    return () => {
      hocuspocusProvider.destroy();
      doc.destroy();
      setProvider(null);
      setYdoc(null);
      setIsSynced(false);
      setAuthFailed(false);
      setSyncTimedOut(false);
      setCollaborationReady(false);
    };
  }, [noteId, getToken, retryCount]);

  // Sync timeout — show error if sync doesn't complete within 15 seconds
  useEffect(() => {
    if (!provider || isSynced || authFailed) return;
    const timeout = setTimeout(() => setSyncTimedOut(true), 15000);
    return () => clearTimeout(timeout);
  }, [provider, isSynced, authFailed]);

  // Handle retry — bumps retryCount to re-trigger the provider creation effect
  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  // Validate noteId format
  if (!isValidNoteId) {
    if (import.meta.env.DEV) console.error(`CollaborativeTiptapEditor received invalid noteId: "${noteId}"`);
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-500 dark:text-gray-400 gap-3" role="alert">
        <span className="text-sm font-medium text-red-600 dark:text-red-400">This note could not be found</span>
        <span className="text-xs">The link may be broken or the note may have been deleted.</span>
      </div>
    );
  }

  // Show loading/error state while provider is initializing or waiting for first sync.
  if (!provider || !ydoc || !collaborationReady) {
    if (authFailed) {
      return (
        <div className="flex flex-col h-full items-center justify-center text-gray-500 dark:text-gray-400 gap-3" role="alert">
          <span className="w-3 h-3 rounded-full bg-red-500" aria-hidden="true" />
          <span className="text-sm font-medium text-red-600 dark:text-red-400">Authentication failed</span>
          <span className="text-xs">Please refresh the page or log in again.</span>
        </div>
      );
    }

    if (syncTimedOut) {
      return (
        <div className="flex flex-col h-full items-center justify-center text-gray-500 dark:text-gray-400 gap-3" role="alert">
          <span className="w-3 h-3 rounded-full bg-yellow-500" aria-hidden="true" />
          <span className="text-sm font-medium">Connection is taking too long</span>
          <span className="text-xs">The collaboration server may be unavailable.</span>
          <button
            onClick={handleRetry}
            className="mt-2 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-500 dark:text-gray-400 gap-2 animate-[fadeIn_0.3s_ease-out_0.3s_both]" role="status" aria-live="polite">
        <span className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span className="text-sm">Loading collaborative editor...</span>
      </div>
    );
  }

  return (
    <EditorErrorBoundary onRetry={handleRetry}>
      <CollabEditorContent
        provider={provider}
        ydoc={ydoc}
        disabled={disabled}
        placeholder={placeholder}
        username={username || 'Anonymous'}
        userColor={userColor || '#999999'}
        connectionStatus={connectionStatus}
      />
    </EditorErrorBoundary>
  );
}
