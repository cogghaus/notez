import { useState, useEffect, useRef } from 'react';
import { notesApi, aiApi, foldersApi, serviceAccountsApi } from '../lib/api';
import { Save, Trash2, Sparkles, FileText as FileTextIcon, Tags, RotateCcw, Eye, Code, HelpCircle, ChevronDown, ChevronUp, Users, Shield, Share2, Bot } from 'lucide-react';
import { TagInput } from './TagInput';
import { TiptapEditor } from './TiptapEditor';
import { MarkdownHelp } from './MarkdownHelp';
import { FolderChip } from './FolderChip';
import { useConfirm } from './ConfirmDialog';
import { ShareDialog } from './ShareDialog';
import { CollaborativeTiptapEditor } from './CollaborativeTiptapEditor';
import { RawMarkdownEditor, type MonacoEditorInstance } from './RawMarkdownEditor';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { useKeepMonacoCaretVisible } from '../lib/useKeepCaretVisible';

interface Note {
  id: string;
  title: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  folder: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string }>;
  deleted?: boolean;
  deletedAt?: string | null;
  permission?: 'OWNER' | 'EDIT' | 'VIEW' | null;
  isShared?: boolean;
  owner?: { id: string; username: string };
}

interface FolderData {
  id: string;
  name: string;
  icon: string;
  noteCount: number;
}

interface NoteEditorProps {
  noteId: string | null;
  onNoteDeleted: (noteId: string) => void;
  onTagsChanged?: () => void;
  onNoteUpdated?: (noteId: string, updates: { title?: string; folderId?: string | null }) => void;
  onNoteRestored?: (noteId: string) => void;
  serviceAccountMode?: boolean;
}

type EditorMode = 'formatted' | 'raw';

// Curated palette of 12 visually distinct colors for collaboration cursors.
// Using a palette instead of hash-to-HSL ensures any two users get distinguishable colors,
// even with short similar names (e.g. "adam" and "pam" previously hashed to nearly identical hues).
const COLLAB_COLORS = [
  '#E53E3E', // red
  '#DD6B20', // orange
  '#B7791F', // amber (darkened from #D69E2E for WCAG contrast on white)
  '#38A169', // green
  '#319795', // teal
  '#3182CE', // blue
  '#5A67D8', // indigo
  '#805AD5', // purple
  '#D53F8C', // pink
  '#2B6CB0', // dark blue
  '#C05621', // burnt orange
  '#276749', // forest green
];

function getUserColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

export function NoteEditor({ noteId, onNoteDeleted, onTagsChanged, onNoteUpdated, onNoteRestored, serviceAccountMode }: NoteEditorProps) {
  const confirm = useConfirm();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('formatted');
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);
  const [showAiActions, setShowAiActions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [aiLoading, setAiLoading] = useState<'summarize' | 'title' | 'tags' | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveErrorShownRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const monacoRef = useRef<MonacoEditorInstance | null>(null);
  useKeepMonacoCaretVisible(monacoRef);
  // Drop the disposed raw editor when leaving raw mode.
  useEffect(() => {
    if (editorMode !== 'raw') monacoRef.current = null;
  }, [editorMode]);

  // Load folders on mount
  useEffect(() => {
    loadFolders();
  }, []);

  // Load note when noteId changes
  useEffect(() => {
    saveErrorShownRef.current = false;
    if (noteId) {
      loadNote(noteId);
    } else {
      setNote(null);
      setTitle('');
      setContent('');
      setTags([]);
      setSelectedFolderId(null);
    }
  }, [noteId]);

  // Auto-select title text for "Untitled Note" so user can immediately type a new name
  // Skip for read-only notes (deleted or VIEW permission) — selecting disabled inputs is jarring
  useEffect(() => {
    const isNoteReadOnly = note?.deleted || note?.permission === 'VIEW';
    if (!isLoading && note && !isNoteReadOnly && title === 'Untitled Note' && titleInputRef.current) {
      const timer = setTimeout(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isLoading, note?.id]);

  // Auto-save when content changes (skip for VIEW-only shared notes)
  useEffect(() => {
    if (!note) return;
    if (note.permission === 'VIEW') return;

    const isCollaborative = note?.isShared && !note?.deleted;

    // In collaborative mode, Hocuspocus handles content persistence.
    // But metadata (folder, title, tags) still needs REST auto-save.
    if (isCollaborative) {
      const titleChanged = title !== note.title;
      const folderChanged = selectedFolderId !== (note.folder?.id || null);
      const currentTagNames = tags.map((t) => t.name);
      const noteTagNames = (note.tags || []).map((t) => t.name);
      const tagsChanged = JSON.stringify(currentTagNames.sort()) !== JSON.stringify(noteTagNames.sort());

      // Only trigger REST save if metadata changed (not content)
      if (!titleChanged && !folderChanged && !tagsChanged) return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save (2 seconds after last change)
    saveTimeoutRef.current = setTimeout(() => {
      saveNote();
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, content, tags, selectedFolderId]);

  const loadFolders = async () => {
    try {
      const response = await foldersApi.list();
      setFolders(response.data.folders);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load folders:', error);
      showToast('Failed to load folders', 'error');
    }
  };

  const loadNote = async (id: string) => {
    setIsLoading(true);
    try {
      let loadedNote;
      if (serviceAccountMode) {
        // Admin viewing a service account note — use admin endpoint
        const response = await serviceAccountsApi.getNote(id);
        const data = response.data;
        loadedNote = {
          id: data.id,
          title: data.title,
          content: data.content,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          folder: data.folder,
          tags: (data.tags || []).map((t: any) => t.tag || t),
          permission: 'VIEW' as const,
          owner: data.user,
        };
      } else {
        const response = await notesApi.get(id);
        loadedNote = response.data.note;
      }
      setNote(loadedNote);
      setTitle(loadedNote.title);
      setContent(loadedNote.content || '');
      setTags(loadedNote.tags || []);
      setSelectedFolderId(loadedNote.folder?.id || null);
      setLastSaved(new Date(loadedNote.updatedAt));
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load note:', error);
      showToast('Failed to load note', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const saveNote = async () => {
    if (!note || isSaving) return; // Prevent concurrent saves

    const currentTagNames = tags.map((t) => t.name);
    const noteTagNames = (note.tags || []).map((t) => t.name);
    const tagsChanged = JSON.stringify(currentTagNames.sort()) !== JSON.stringify(noteTagNames.sort());
    const titleChanged = title !== note.title;
    const folderChanged = selectedFolderId !== (note.folder?.id || null);

    if (title === note.title && content === (note.content || '') && !tagsChanged && !folderChanged) return;

    setIsSaving(true);
    const isCollaborative = note?.isShared && !note?.deleted;
    try {
      const response = await notesApi.update(note.id, {
        title,
        // In collaborative mode, Hocuspocus is authoritative for content.
        // Sending stale React state would overwrite the live Yjs document.
        ...(isCollaborative ? {} : { content }),
        tags: currentTagNames,
        folderId: selectedFolderId,
      });
      const updatedNote = response.data.note;
      setLastSaved(new Date(updatedNote.updatedAt));
      saveErrorShownRef.current = false; // Reset on successful save

      // Update note object with server response. The update response carries no
      // isShared/permission/owner, so keep ours: losing isShared silently dropped a
      // shared note out of the collaborative editor, and its next autosave then
      // overwrote the live document for every collaborator.
      setNote((prev) => ({
        ...updatedNote,
        isShared: prev?.isShared,
        permission: prev?.permission,
        owner: prev?.owner,
      }));

      // CRITICAL: never write title/content back from the response. title and content
      // here are the values from when this save started, so writing them back rolled
      // the editor back to that snapshot whenever the user kept typing while the
      // request was in flight: the cursor jumped to the end and the newer typing was lost.
      // Tags must be updated to get proper IDs from server
      setTags(updatedNote.tags || []);
      setSelectedFolderId(updatedNote.folder?.id || null);

      // Notify parent if tags changed
      if (tagsChanged) {
        onTagsChanged?.();
      }

      // Notify parent if title or folder changed
      if (titleChanged || folderChanged) {
        onNoteUpdated?.(note.id, {
          title: updatedNote.title,
          folderId: updatedNote.folder?.id || null
        });
      }
    } catch (error: unknown) {
      if (import.meta.env.DEV) console.error('Failed to save note:', error);
      if (!saveErrorShownRef.current) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        const msg = status === 403
          ? 'Only the note owner can change folders'
          : 'Failed to save note';
        showToast(msg, 'error');
        saveErrorShownRef.current = true;
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!note || !noteId) return;
    // Prevent deleting if state is stale (noteId prop changed but note state hasn't updated)
    if (note.id !== noteId) return;

    // If already in trash, permanently delete
    if (note.deleted) {
      const confirmed = await confirm({
        title: 'Permanently Delete Note',
        message: `Permanently delete "${note.title}"? This cannot be undone.`,
        confirmText: 'Delete Forever',
        variant: 'danger',
      });
      if (!confirmed) return;
      try {
        await notesApi.permanentDelete(noteId);
        onNoteDeleted(noteId);
      } catch (error) {
        if (import.meta.env.DEV) console.error('Failed to permanently delete note:', error);
        showToast('Failed to permanently delete note', 'error');
      }
    } else {
      // Move to trash (soft delete)
      const confirmed = await confirm({
        title: 'Move to Trash',
        message: `Move "${note.title}" to trash?`,
        confirmText: 'Move to Trash',
        variant: 'warning',
      });
      if (!confirmed) return;
      try {
        await notesApi.delete(noteId);
        onNoteDeleted(noteId);
      } catch (error) {
        if (import.meta.env.DEV) console.error('Failed to delete note:', error);
        showToast('Failed to delete note', 'error');
      }
    }
  };

  const handleRestoreNote = async () => {
    if (!note || !noteId) return;
    if (note.id !== noteId) return;

    try {
      await notesApi.restore(noteId);
      onNoteRestored?.(noteId);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to restore note:', error);
      showToast('Failed to restore note', 'error');
    }
  };

  const handleManualSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveNote();
  };

  const handleAISummarize = async () => {
    if (!content.trim()) {
      showToast('Please add some content to summarize', 'warning');
      return;
    }

    setAiLoading('summarize');

    try {
      const response = await aiApi.summarize({ content });
      const summary = response.data.summary;

      // Insert summary at the beginning of content
      const newContent = `**AI Summary:**\n${summary}\n\n---\n\n${content}`;
      setContent(newContent);
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to generate summary', 'error');
    } finally {
      setAiLoading(null);
    }
  };

  const handleAISuggestTitle = async () => {
    if (!content.trim()) {
      showToast('Please add some content to generate a title', 'warning');
      return;
    }

    setAiLoading('title');

    try {
      const response = await aiApi.suggestTitle({ content });
      const suggestedTitle = response.data.title;

      // Only set if title is empty or user confirms
      if (!title.trim()) {
        setTitle(suggestedTitle);
      } else {
        const confirmed = await confirm({
          title: 'Replace Title',
          message: `Replace current title with: "${suggestedTitle}"?`,
          confirmText: 'Replace',
          variant: 'default',
        });
        if (confirmed) {
          setTitle(suggestedTitle);
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to suggest title', 'error');
    } finally {
      setAiLoading(null);
    }
  };

  const handleAISuggestTags = async () => {
    if (!content.trim()) {
      showToast('Please add some content to suggest tags', 'warning');
      return;
    }

    setAiLoading('tags');

    try {
      const response = await aiApi.suggestTags({ content });
      const suggestedTags = response.data.tags;

      // Merge with existing tags (avoid duplicates)
      const existingTagNames = tags.map((t) => t.name.toLowerCase());
      const newTagObjects = suggestedTags
        .filter((tagName: string) => !existingTagNames.includes(tagName.toLowerCase()))
        .map((tagName: string) => ({ id: '', name: tagName }));

      if (newTagObjects.length > 0) {
        setTags([...tags, ...newTagObjects]);
      } else {
        showToast('All suggested tags are already added', 'info');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to suggest tags', 'error');
    } finally {
      setAiLoading(null);
    }
  };

  if (!noteId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-700">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No note selected</h3>
          <p className="text-gray-500 dark:text-gray-400">Select a note or create a new one to get started</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-700">
        <div className="text-gray-500 dark:text-gray-400">Loading note...</div>
      </div>
    );
  }

  const isDeleted = note?.deleted || false;
  const isOwner = note?.permission === 'OWNER' || !note?.permission;
  const isViewOnly = note?.permission === 'VIEW';
  const isReadOnly = isDeleted || isViewOnly;
  const isCollabMode = note?.isShared && !isDeleted && note?.permission !== 'VIEW';

  const currentUsername = user?.username || 'Anonymous';
  const currentUserColor = getUserColor(currentUsername);

  return (
    <div data-note-editor className="flex-1 min-h-0 flex flex-col bg-white dark:bg-gray-800">
      {/* Service Account Banner */}
      {serviceAccountMode && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-6 py-2 flex items-center gap-2">
          <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Viewing service account note (read-only) &mdash; by <span className="font-medium">{note?.owner?.username || 'unknown'}</span>
          </p>
        </div>
      )}

      {/* View-Only Banner for shared notes */}
      {isViewOnly && !serviceAccountMode && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-6 py-2 flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            View only &mdash; shared by <span className="font-medium">{note?.owner?.username || 'unknown'}</span>
          </p>
        </div>
      )}

      {/* Shared EDIT Banner */}
      {note?.permission === 'EDIT' && !isOwner && (
        <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-6 py-2 flex items-center gap-2">
          <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
          <p className="text-sm text-green-800 dark:text-green-200">
            Shared note &mdash; you can edit (shared by <span className="font-medium">{note?.owner?.username || 'unknown'}</span>)
          </p>
        </div>
      )}

      {/* Trash Warning Banner */}
      {isDeleted && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-6 py-3">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            This note is in the trash. Restore it to edit, or permanently delete it.
          </p>
        </div>
      )}

      {/* Editor Header - Compact on mobile */}
      <div className="px-3 sm:px-6 py-2 sm:py-4 border-b border-gray-200 dark:border-gray-700 space-y-2 sm:space-y-3">
        {/* Title Row */}
        <div className="flex items-center justify-between gap-2">
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isReadOnly}
            className="flex-1 text-lg sm:text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none px-1 sm:px-2 py-0.5 sm:py-1 transition-colors disabled:opacity-60 disabled:cursor-not-allowed min-w-0"
            placeholder="Untitled Note"
          />
          <div className="flex items-center space-x-1 sm:space-x-3 flex-shrink-0">
            {/* Save Status - hide text on mobile; hidden in collaborative mode and service account mode */}
            {!isCollabMode && !serviceAccountMode && (
              <div className="flex items-center space-x-1 sm:space-x-2">
                {isSaving ? (
                  <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">Saving...</span>
                ) : lastSaved ? (
                  <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">
                    Saved {formatSaveTime(lastSaved)}
                  </span>
                ) : null}
                <button
                  onClick={handleManualSave}
                  className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                  title={isSaving ? 'Saving...' : lastSaved ? `Saved ${formatSaveTime(lastSaved)}` : 'Save now'}
                >
                  <Save className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Editor Mode Toggle - compact */}
            <button
              onClick={() => setEditorMode(editorMode === 'formatted' ? 'raw' : 'formatted')}
              disabled={isReadOnly}
              className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title={editorMode === 'formatted' ? 'Switch to raw markdown' : 'Switch to formatted view'}
            >
              {editorMode === 'formatted' ? <Code className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            {/* Share Button (owner only) */}
            {isOwner && !isDeleted && (
              <button
                onClick={() => setShowShareDialog(true)}
                className={`p-1.5 sm:p-2 rounded-md transition-colors ${
                  note?.isShared
                    ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={note?.isShared ? 'Manage sharing' : 'Share note'}
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}

            {/* Markdown Help Button - hidden in service account mode */}
            {!serviceAccountMode && (
              <button
                onClick={() => setShowMarkdownHelp(true)}
                disabled={isReadOnly}
                className="hidden sm:block p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Markdown syntax help"
              >
                <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}

            {/* Restore Button (for trash) */}
            {note?.deleted && !serviceAccountMode && (
              <button
                onClick={handleRestoreNote}
                className="p-1.5 sm:p-2 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md"
                title="Restore note"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}

            {/* Delete Button - hidden in service account mode */}
            {!serviceAccountMode && (
              <button
                onClick={handleDeleteNote}
                className="p-1.5 sm:p-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                title={note?.deleted ? "Permanently delete" : "Move to trash"}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Folder Selector and Tags Row - stacked on mobile */}
        <div data-kb-hide className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          {/* Folder Selector */}
          <FolderChip
            folders={folders}
            selectedFolderId={selectedFolderId}
            onChange={setSelectedFolderId}
            onRefresh={loadFolders}
            disabled={isDeleted || !!serviceAccountMode}
          />

          {/* Tags */}
          <div className="flex-1 min-w-0">
            <TagInput
              tags={tags}
              onChange={(tagNames) => {
                // Convert tag names to tag objects, preserving existing IDs
                const newTags = tagNames.map((name) => {
                  const existing = tags.find((t) => t.name === name);
                  return existing || { id: '', name };
                });
                setTags(newTags);
              }}
              disabled={!!serviceAccountMode}
            />
          </div>
        </div>

        {/* AI Actions - Collapsible on mobile, horizontal on desktop; hidden in service account mode */}
        {!serviceAccountMode && (
        <div data-kb-hide className="border-t border-gray-100 dark:border-gray-700 pt-2">
          {/* Mobile: Collapsible toggle */}
          <button
            onClick={() => setShowAiActions(!showAiActions)}
            className="sm:hidden flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-purple-600 dark:hover:text-purple-400 transition-colors w-full"
          >
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span>AI Actions</span>
            {showAiActions ? (
              <ChevronUp className="w-4 h-4 ml-auto" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-auto" />
            )}
          </button>

          {/* Mobile: Collapsible content */}
          {showAiActions && (
            <div className="sm:hidden flex flex-wrap items-center gap-2 mt-2">
              <button
                onClick={handleAISummarize}
                disabled={!content.trim() || aiLoading === 'summarize'}
                className="px-3 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                title="Generate summary and add to beginning of note"
              >
                {aiLoading === 'summarize' ? (
                  <>
                    <span className="inline-block animate-spin">⏳</span>
                    <span>Summarizing...</span>
                  </>
                ) : (
                  <>
                    <FileTextIcon className="w-3 h-3" />
                    <span>Summarize</span>
                  </>
                )}
              </button>

              <button
                onClick={handleAISuggestTitle}
                disabled={!content.trim() || aiLoading === 'title'}
                className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                title="Suggest a title based on content"
              >
                {aiLoading === 'title' ? (
                  <>
                    <span className="inline-block animate-spin">⏳</span>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <FileTextIcon className="w-3 h-3" />
                    <span>Suggest Title</span>
                  </>
                )}
              </button>

              <button
                onClick={handleAISuggestTags}
                disabled={!content.trim() || aiLoading === 'tags'}
                className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                title="Suggest relevant tags"
              >
                {aiLoading === 'tags' ? (
                  <>
                    <span className="inline-block animate-spin">⏳</span>
                    <span>Suggesting...</span>
                  </>
                ) : (
                  <>
                    <Tags className="w-3 h-3" />
                    <span>Suggest Tags</span>
                  </>
                )}
              </button>

            </div>
          )}

          {/* Desktop: Always visible horizontal layout */}
          <div className="hidden sm:flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">AI:</span>

            <button
              onClick={handleAISummarize}
              disabled={!content.trim() || aiLoading === 'summarize'}
              className="px-3 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
              title="Generate summary and add to beginning of note"
            >
              {aiLoading === 'summarize' ? (
                <>
                  <span className="inline-block animate-spin">⏳</span>
                  <span>Summarizing...</span>
                </>
              ) : (
                <>
                  <FileTextIcon className="w-3 h-3" />
                  <span>Summarize</span>
                </>
              )}
            </button>

            <button
              onClick={handleAISuggestTitle}
              disabled={!content.trim() || aiLoading === 'title'}
              className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
              title="Suggest a title based on content"
            >
              {aiLoading === 'title' ? (
                <>
                  <span className="inline-block animate-spin">⏳</span>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <FileTextIcon className="w-3 h-3" />
                  <span>Suggest Title</span>
                </>
              )}
            </button>

            <button
              onClick={handleAISuggestTags}
              disabled={!content.trim() || aiLoading === 'tags'}
              className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
              title="Suggest relevant tags"
            >
              {aiLoading === 'tags' ? (
                <>
                  <span className="inline-block animate-spin">⏳</span>
                  <span>Suggesting...</span>
                </>
              ) : (
                <>
                  <Tags className="w-3 h-3" />
                  <span>Suggest Tags</span>
                </>
              )}
            </button>

          </div>
        </div>
        )}
      </div>

      {/* Editor (Collaborative, Tiptap, or Monaco) */}
      <div className="flex-1 min-h-0 relative flex flex-col">
        {note?.isShared && !isDeleted && !isViewOnly ? (
          /* Collaborative mode for shared notes with EDIT access */
          <CollaborativeTiptapEditor
            key={`collab-editor-${note.id}`}
            noteId={note.id}
            disabled={false}
            placeholder="Start writing collaboratively..."
            username={currentUsername}
            userColor={currentUserColor}
          />
        ) : editorMode === 'formatted' ? (
          <TiptapEditor
            key="formatted-editor"
            content={content}
            onChange={setContent}
            disabled={isReadOnly}
            placeholder="Start writing your note... Use markdown: ## headers, **bold**, *italic*, - lists, [ ] tasks"
          />
        ) : (
          <RawMarkdownEditor
            key="raw-editor"
            onMount={(editor) => {
              monacoRef.current = editor;
            }}
            value={content}
            onChange={setContent}
            readOnly={isReadOnly}
          />
        )}
      </div>

      {/* Word Count Footer */}
      <div className="flex-shrink-0 px-6 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900" data-kb-hide>
        <div className="text-xs text-gray-500 dark:text-gray-400 space-x-4">
          <span>{content.trim() ? content.trim().split(/\s+/).length : 0} words</span>
          <span>{content.length} characters</span>
        </div>
      </div>

      {/* Markdown Help Modal */}
      <MarkdownHelp isOpen={showMarkdownHelp} onClose={() => setShowMarkdownHelp(false)} />

      {/* Share Dialog */}
      {note && (
        <ShareDialog
          isOpen={showShareDialog}
          onClose={() => setShowShareDialog(false)}
          noteId={note.id}
          noteTitle={note.title}
        />
      )}
    </div>
  );
}

// Helper function
function FileText({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function formatSaveTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);

  if (diffSecs < 10) return 'just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  return date.toLocaleTimeString();
}
