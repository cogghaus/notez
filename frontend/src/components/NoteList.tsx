import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { notesApi, sharesApi, serviceAccountsApi } from '../lib/api';
import { FileText, Files, Plus, Search, Bot, ArrowLeft } from 'lucide-react';
import { useToast } from './Toast';
import { previewText } from '../lib/previewText';

interface Note {
  id: string;
  title: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  folder: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string }>;
  isShared?: boolean;
  shareInfo?: {
    shareId: string;
    permission: 'VIEW' | 'EDIT';
    owner: { id: string; username: string };
    sharedAt: string;
  };
}

interface NoteListProps {
  folderId: string | null;
  tagId: string | null;
  selectedNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onNoteCreated?: () => void;
  serviceAccountId?: string;
  onBackToDashboard?: () => void;
}

export interface NoteListHandle {
  refresh: () => void;
  removeNote: (noteId: string) => void;
  updateNote: (noteId: string, updates: { title?: string; folderId?: string | null }) => void;
}

export const NoteList = forwardRef<NoteListHandle, NoteListProps>(({ folderId, tagId, selectedNoteId, onSelectNote, onNoteCreated, serviceAccountId, onBackToDashboard }, ref) => {
  const { showToast } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      loadNotes();
    }, 300);
    return () => clearTimeout(timer);
  }, [folderId, tagId, searchQuery, serviceAccountId]);

  // Clear search query when folder changes
  useEffect(() => {
    setSearchQuery('');
  }, [folderId]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    refresh: loadNotes,
    removeNote: (noteId: string) => {
      setNotes(prevNotes => prevNotes.filter(note => note.id !== noteId));
    },
    updateNote: (noteId: string, updates: { title?: string; folderId?: string | null }) => {
      setNotes(prevNotes => prevNotes.map(note =>
        note.id === noteId
          ? { ...note, ...updates, folder: updates.folderId !== undefined ? note.folder : note.folder }
          : note
      ));
    }
  }));

  const loadNotes = async () => {
    setIsLoading(true);
    try {
      // Special case: 'trash' means load deleted notes
      if (folderId === 'trash') {
        const response = await notesApi.listTrash();
        setNotes(response.data.notes);
      } else if (folderId === 'shared') {
        // Load notes shared with the current user
        const response = await sharesApi.sharedWithMe();
        setNotes(response.data.notes);
      } else if (folderId === 'my-shares') {
        // Load notes the current user has shared out
        const response = await sharesApi.sharedByMe();
        setNotes(response.data.notes);
      } else if (folderId === 'service-accounts') {
        // Load notes from service accounts (admin only), filter server-side by userId if selected
        const params: { limit: number; userId?: string } = { limit: 100 };
        if (serviceAccountId) {
          params.userId = serviceAccountId;
        }
        const response = await serviceAccountsApi.listNotes(params);
        // Map to Note interface with shareInfo for owner label display
        const mapped = response.data.notes.map((n: any) => ({
          ...n,
          content: null,
          tags: n.tags ?? [],
          shareInfo: {
            shareId: '',
            permission: 'VIEW' as const,
            owner: n.user,
            sharedAt: n.createdAt,
          },
        }));
        setNotes(mapped);
      } else {
        const params: any = { limit: 100 };
        if (folderId) {
          // Special case: 'unfiled' means notes with no folder (folderId = null in backend)
          if (folderId === 'unfiled') {
            params.folderId = 'null';
          } else {
            params.folderId = folderId;
          }
        }
        if (tagId) {
          params.tagId = tagId;
        }
        if (searchQuery) {
          params.search = searchQuery;
        }

        const response = await notesApi.list(params);
        setNotes(response.data.notes);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load notes:', error);
      showToast('Failed to load notes', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadNotes();
  };

  const handleCreateNote = async () => {
    try {
      const response = await notesApi.create({
        title: 'Untitled Note',
        content: '',
        // Don't set folderId for unfiled notes, or if no folder is selected
        folderId: folderId && !['unfiled', 'shared', 'my-shares', 'trash', 'service-accounts'].includes(folderId) ? folderId : undefined,
      });
      const newNote = response.data.note;
      setNotes([newNote, ...notes]);
      onSelectNote(newNote.id);
      // Notify parent that a note was created
      onNoteCreated?.();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to create note:', error);
      showToast('Failed to create note', 'error');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="w-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {onBackToDashboard && (
              <button
                onClick={onBackToDashboard}
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                title="Back to Service Accounts"
                aria-label="Back to Service Accounts"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {folderId === 'shared' ? 'Shared with me' : folderId === 'my-shares' ? 'My Shares' : folderId === 'service-accounts' ? 'Service Accounts' : 'Notes'}
            </h2>
          </div>
          {folderId !== 'shared' && folderId !== 'my-shares' && folderId !== 'service-accounts' && (
            <button
              onClick={handleCreateNote}
              className="p-1.5 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600"
              title="New note"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search - hidden for virtual views that don't support server-side search */}
        {folderId !== 'shared' && folderId !== 'my-shares' && folderId !== 'service-accounts' && (
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-300 border border-gray-400 dark:border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </form>
        )}
      </div>

      {/* Notes List */}
      <div data-scroll-key="notes" className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</div>
        ) : notes.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {folderId === 'shared'
              ? 'No notes have been shared with you yet.'
              : folderId === 'my-shares'
              ? "You haven't shared any notes yet."
              : folderId === 'trash'
              ? 'Trash is empty.'
              : folderId === 'service-accounts'
              ? 'No service account notes found.'
              : 'No notes yet. Click + to create one!'}
          </div>
        ) : (
          notes.map((note) => {
            const preview = previewText(note.content);
            return (
              <button
                key={note.id}
                data-note-id={note.id}
                onClick={() => onSelectNote(note.id)}
                draggable={folderId !== 'trash' && folderId !== 'shared' && folderId !== 'my-shares' && folderId !== 'service-accounts'}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('application/json', JSON.stringify({ noteId: note.id, noteTitle: note.title }));
                }}
                className={`w-full px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left ${
                  folderId !== 'trash' && folderId !== 'shared' && folderId !== 'my-shares' && folderId !== 'service-accounts' ? 'cursor-move' : 'cursor-pointer'
                } ${
                  selectedNoteId === note.id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600' : ''
                }`}
              >
                <div className="flex items-start space-x-2">
                  {folderId === 'service-accounts' ? (
                    <Bot className="w-4 h-4 text-purple-500 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                  ) : (note.isShared || note.shareInfo) ? (
                    <Files className="w-4 h-4 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">{note.title}</h3>
                    {/* Show owner name for shared-with-me and service account notes */}
                    {note.shareInfo && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                        by {note.shareInfo.owner.username}{folderId !== 'service-accounts' ? ` \u00B7 ${note.shareInfo.permission.toLowerCase()}` : ''}
                      </p>
                    )}
                    {preview && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">
                        {preview}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(note.updatedAt)}</span>
                      {note.tags.length > 0 && (
                        <div className="flex space-x-1">
                          {note.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag.id}
                              className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});
