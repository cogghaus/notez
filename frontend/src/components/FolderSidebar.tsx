import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { foldersApi, tagsApi, notesApi } from '../lib/api';
import { ChevronLeft, ChevronRight, Folder, FolderPlus, Tag, ChevronDown, ChevronUp, FileQuestion, Trash2, CheckSquare, Sparkles, MoreHorizontal, Users, Share2, Bot } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { EditableListItem } from './EditableListItem';
import { FolderIcon, FolderIconPicker } from './FolderIconPicker';
import { WhatsNewModal, hasNewVersion } from './WhatsNewModal';
import { useConfirm } from './ConfirmDialog';
import { Popover } from './Popover';
import { useToast } from './Toast';

interface FolderData {
  id: string;
  name: string;
  icon: string;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
}

interface TagData {
  id: string;
  name: string;
  noteCount: number;
}

interface FolderSidebarProps {
  selectedFolderId: string | null;
  selectedTagId: string | null;
  selectedView: 'notes' | 'tasks';
  onSelectFolder: (folderId: string | null) => void;
  onSelectTag: (tagId: string | null) => void;
  onSelectView: (view: 'notes' | 'tasks') => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNoteMoved?: () => void;
}

export interface FolderSidebarHandle {
  refreshFolders: () => void;
  refreshTags: () => void;
  refreshAll: () => void;
}

export const FolderSidebar = forwardRef<FolderSidebarHandle, FolderSidebarProps>(({
  selectedFolderId,
  selectedTagId,
  selectedView,
  onSelectFolder,
  onSelectTag,
  onSelectView,
  collapsed,
  onToggleCollapse,
  onNoteMoved,
}, ref) => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === 'admin';
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [tags, setTags] = useState<TagData[]>([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);
  const [sharedByMeCount, setSharedByMeCount] = useState(0);
  const [sharedWithMeCount, setSharedWithMeCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState('folder');
  const [tagsExpanded, setTagsExpanded] = useState(true);
  const [isDragOverUnfiled, setIsDragOverUnfiled] = useState(false);
  // Track editing state for folder icons
  const [editingFolderIcons, setEditingFolderIcons] = useState<Record<string, string>>({});
  // What's New modal state
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const currentVersion = import.meta.env.VITE_APP_VERSION || '0.0.0';
  const [showNewBadge, setShowNewBadge] = useState(() => hasNewVersion(currentVersion));

  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true);
      const results = await Promise.allSettled([loadFolders(), loadTags(), loadStats()]);
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        showToast('Failed to load sidebar data', 'error');
      }
      setIsLoading(false);
    };
    loadAll();
  }, []);

  // Expose refresh methods to parent
  useImperativeHandle(ref, () => ({
    refreshFolders: async () => {
      setIsLoading(true);
      const results = await Promise.allSettled([loadFolders(), loadStats()]);
      if (results.some(r => r.status === 'rejected')) showToast('Failed to refresh folders', 'error');
      setIsLoading(false);
    },
    refreshTags: async () => {
      setIsLoading(true);
      try { await loadTags(); } catch { showToast('Failed to load tags', 'error'); }
      setIsLoading(false);
    },
    refreshAll: async () => {
      setIsLoading(true);
      const results = await Promise.allSettled([loadFolders(), loadTags(), loadStats()]);
      if (results.some(r => r.status === 'rejected')) showToast('Failed to load sidebar data', 'error');
      setIsLoading(false);
    }
  }));

  const loadFolders = async () => {
    try {
      const response = await foldersApi.list();
      setFolders(response.data.folders);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load folders:', error);
      throw error; // Let caller handle toast
    }
  };

  const loadTags = async () => {
    try {
      const response = await tagsApi.list();
      setTags(response.data.tags);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load tags:', error);
      throw error; // Let caller handle toast
    }
  };

  const loadStats = async () => {
    try {
      const response = await notesApi.stats();
      setUnfiledCount(response.data.unfiledNotes || 0);
      setDeletedCount(response.data.deletedNotes || 0);
      setSharedByMeCount(response.data.sharedByMeCount || 0);
      setSharedWithMeCount(response.data.sharedWithMeCount || 0);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load stats:', error);
      throw error; // Let caller handle toast
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await foldersApi.create({ name: newFolderName.trim(), icon: newFolderIcon });
      setNewFolderName('');
      setNewFolderIcon('folder');
      setShowNewFolderInput(false);
      loadFolders();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to create folder', 'error');
    }
  };

  const handleRenameFolder = async (folderId: string, newName: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    const editedIcon = editingFolderIcons[folderId];
    const nameChanged = newName !== folder.name;
    const iconChanged = editedIcon && editedIcon !== folder.icon;

    // If nothing changed, just clear editing state and return
    if (!nameChanged && !iconChanged) {
      setEditingFolderIcons(prev => {
        const next = { ...prev };
        delete next[folderId];
        return next;
      });
      return;
    }

    // Build payload with only changed fields
    const payload: { name?: string; icon?: string } = {};
    if (nameChanged) payload.name = newName;
    if (iconChanged) payload.icon = editedIcon;

    // Optimistic update
    const originalFolders = folders;
    const updatedFolders = folders.map((f) =>
      f.id === folderId ? { ...f, ...payload } : f
    );
    setFolders(updatedFolders);

    try {
      await foldersApi.update(folderId, payload);
      // Clear editing icon state only on success
      setEditingFolderIcons(prev => {
        const next = { ...prev };
        delete next[folderId];
        return next;
      });
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update folder', 'error');
      setFolders(originalFolders); // Revert on error
      throw error; // Re-throw so EditableListItem keeps edit mode open
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const confirmed = await confirm({
      title: 'Delete Folder',
      message: `Delete folder "${folderName}"? Notes in this folder will be moved to unfiled.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    // Optimistic update
    const originalFolders = folders;
    setFolders(folders.filter((f) => f.id !== folderId));
    if (selectedFolderId === folderId) {
      onSelectFolder(null);
    }

    try {
      await foldersApi.delete(folderId);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to delete folder', 'error');
      setFolders(originalFolders); // Revert on error
    }
  };

  const handleRenameTag = async (tagId: string, newName: string) => {
    // Optimistic update
    const originalTags = tags;
    const updatedTags = tags.map((t) =>
      t.id === tagId ? { ...t, name: newName } : t
    );
    setTags(updatedTags);

    try {
      await tagsApi.rename(tagId, newName);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to rename tag', 'error');
      setTags(originalTags); // Revert on error
    }
  };

  const handleDeleteTag = async (tagId: string, tagName: string) => {
    const confirmed = await confirm({
      title: 'Delete Tag',
      message: `Delete tag "${tagName}"? This will remove it from all notes.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    // Optimistic update
    const originalTags = tags;
    setTags(tags.filter((t) => t.id !== tagId));
    if (selectedTagId === tagId) {
      onSelectTag(null);
    }

    try {
      await tagsApi.delete(tagId);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to delete tag', 'error');
      setTags(originalTags); // Revert on error
    }
  };

  const handleNoteDrop = async (folderId: string, noteId: string) => {
    try {
      // Update note's folder
      await notesApi.update(noteId, { folderId: folderId === 'unfiled' ? null : folderId });

      // Refresh counts and folders in parallel for faster UI update
      await Promise.all([loadStats(), loadFolders()]);

      // Notify parent to refresh note list immediately
      onNoteMoved?.();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to move note', 'error');
      // Refresh to revert any optimistic updates
      await Promise.all([loadStats(), loadFolders()]);
      onNoteMoved?.();
    }
  };

  if (collapsed) {
    return (
      <nav aria-label="Sidebar navigation" className="w-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
        {/* Expand button */}
        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md w-full flex justify-center"
            title="Expand sidebar"
          >
            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Scrollable icons */}
        <div className="flex-1 overflow-y-auto py-2 space-y-1">
          {/* All Notes */}
          <Popover
            trigger={
              <button
                onClick={() => {
                  onSelectView('notes');
                  onSelectFolder(null);
                  onSelectTag(null);
                }}
                aria-current={selectedView === 'notes' && selectedFolderId === null && selectedTagId === null ? 'page' : undefined}
                className={`w-full p-2 flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  selectedView === 'notes' && selectedFolderId === null && selectedTagId === null
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-600'
                    : ''
                }`}
              >
                <Folder className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            }
          >
            <div className="font-medium text-gray-900 dark:text-white">All Notes</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">View all notes</div>
          </Popover>

          {/* Tasks */}
          <Popover
            trigger={
              <button
                onClick={() => onSelectView('tasks')}
                aria-current={selectedView === 'tasks' ? 'page' : undefined}
                className={`w-full p-2 flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  selectedView === 'tasks'
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-600'
                    : ''
                }`}
              >
                <CheckSquare className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            }
          >
            <div className="font-medium text-gray-900 dark:text-white">Tasks</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">View all tasks</div>
          </Popover>

          {/* My Shares */}
          <Popover
            trigger={
              <button
                onClick={() => {
                  onSelectView('notes');
                  onSelectFolder('my-shares');
                  onSelectTag(null);
                }}
                aria-current={selectedFolderId === 'my-shares' ? 'page' : undefined}
                className={`w-full p-2 flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  selectedFolderId === 'my-shares'
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-600'
                    : ''
                }`}
              >
                <Share2 className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            }
          >
            <div className="font-medium text-gray-900 dark:text-white">My Shares</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sharedByMeCount > 0 ? `${sharedByMeCount} notes shared` : 'Notes you\'ve shared'}</div>
          </Popover>

          {/* Shared with me */}
          <Popover
            trigger={
              <button
                onClick={() => {
                  onSelectView('notes');
                  onSelectFolder('shared');
                  onSelectTag(null);
                }}
                aria-current={selectedFolderId === 'shared' ? 'page' : undefined}
                className={`w-full p-2 flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  selectedFolderId === 'shared'
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-600'
                    : ''
                }`}
              >
                <Users className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            }
          >
            <div className="font-medium text-gray-900 dark:text-white">Shared with me</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sharedWithMeCount > 0 ? `${sharedWithMeCount} notes` : 'Notes others shared'}</div>
          </Popover>

          {/* Service Accounts (admin only) */}
          {isAdmin && (
            <Popover
              trigger={
                <button
                  onClick={() => {
                    onSelectView('notes');
                    onSelectFolder('service-accounts');
                    onSelectTag(null);
                  }}
                  aria-current={selectedFolderId === 'service-accounts' ? 'page' : undefined}
                  className={`w-full p-2 flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    selectedFolderId === 'service-accounts'
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-600'
                      : ''
                  }`}
                >
                  <Bot className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              }
            >
              <div className="font-medium text-gray-900 dark:text-white">Service Accounts</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">View agent content</div>
            </Popover>
          )}

          {/* Unfiled */}
          <Popover
            trigger={
              <button
                onClick={() => {
                  onSelectView('notes');
                  onSelectFolder('unfiled');
                  onSelectTag(null);
                }}
                aria-current={selectedFolderId === 'unfiled' ? 'page' : undefined}
                className={`w-full p-2 flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  selectedFolderId === 'unfiled'
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-600'
                    : ''
                }`}
              >
                <FileQuestion className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            }
          >
            <div className="font-medium text-gray-900 dark:text-white">Unfiled</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{unfiledCount} notes</div>
          </Popover>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700 my-2 mx-2" />

          {/* Folders - limited to 8 in collapsed mode for cleaner UI */}
          {folders.slice(0, 8).map((folder) => (
            <Popover
              key={folder.id}
              trigger={
                <button
                  onClick={() => {
                    onSelectFolder(folder.id);
                    onSelectTag(null);
                  }}
                  aria-current={selectedFolderId === folder.id ? 'page' : undefined}
                  className={`w-full p-2 flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    selectedFolderId === folder.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-600'
                      : ''
                  }`}
                >
                  <FolderIcon icon={folder.icon} className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              }
            >
              <div className="font-medium text-gray-900 dark:text-white">{folder.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{folder.noteCount} notes</div>
            </Popover>
          ))}

          {/* Overflow indicator when more than 8 folders */}
          {folders.length > 8 && (
            <Popover
              key="folder-overflow-indicator"
              trigger={
                <button
                  onClick={onToggleCollapse}
                  className="w-full p-2 flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <MoreHorizontal className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                </button>
              }
            >
              <div className="font-medium text-gray-900 dark:text-white">+{folders.length - 8} more folders</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Expand to see all</div>
            </Popover>
          )}

          {/* Trash */}
          <div className="border-t border-gray-200 dark:border-gray-700 my-2 mx-2" />
          <Popover
            trigger={
              <button
                onClick={() => {
                  onSelectView('notes');
                  onSelectFolder('trash');
                  onSelectTag(null);
                }}
                aria-current={selectedFolderId === 'trash' ? 'page' : undefined}
                className={`w-full p-2 flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  selectedFolderId === 'trash'
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-600'
                    : ''
                }`}
              >
                <Trash2 className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            }
          >
            <div className="font-medium text-gray-900 dark:text-white">Trash</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{deletedCount} notes</div>
          </Popover>
        </div>

        {/* What's New indicator */}
        {showNewBadge && (
          <div className="p-2 border-t border-gray-200 dark:border-gray-700">
            <Popover
              trigger={
                <button
                  onClick={() => {
                    setShowWhatsNew(true);
                    setShowNewBadge(false);
                    localStorage.setItem('notez-last-seen-version', currentVersion);
                  }}
                  className="w-full p-2 flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <Sparkles className="w-5 h-5 text-amber-500" />
                </button>
              }
            >
              <div className="font-medium text-gray-900 dark:text-white">What's New</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">See latest updates</div>
            </Popover>
          </div>
        )}

        {/* What's New Modal */}
        <WhatsNewModal
          isOpen={showWhatsNew}
          onClose={() => setShowWhatsNew(false)}
          currentVersion={currentVersion}
        />
      </nav>
    );
  }

  return (
    <nav aria-label="Sidebar navigation" className="w-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-white">Folders</h2>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setShowNewFolderInput(true)}
            className="p-1.5 hover:bg-gray-100 dark:bg-gray-700 rounded-md"
            title="New folder"
          >
            <FolderPlus className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-gray-100 dark:bg-gray-700 rounded-md"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* New Folder Input */}
      {showNewFolderInput && (
        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
          <form onSubmit={handleCreateFolder} className="space-y-2">
            <div className="flex items-center space-x-2">
              <FolderIconPicker
                selectedIcon={newFolderIcon}
                onSelectIcon={setNewFolderIcon}
              />
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setShowNewFolderInput(false);
                  setNewFolderName('');
                  setNewFolderIcon('folder');
                }}
                className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Folder List */}
      <div className="flex-1 overflow-y-auto">
        {/* All Notes - Clear all filters */}
        <button
          onClick={() => {
            onSelectView('notes');
            onSelectFolder(null);
            onSelectTag(null);
          }}
          aria-current={selectedView === 'notes' && selectedFolderId === null && selectedTagId === null ? 'page' : undefined}
          className={`w-full px-4 py-2.5 flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-700 ${
            selectedView === 'notes' && selectedFolderId === null && selectedTagId === null ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600' : ''
          }`}
        >
          <Folder className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">All Notes</span>
        </button>

        {/* Tasks View */}
        <button
          onClick={() => onSelectView('tasks')}
          aria-current={selectedView === 'tasks' ? 'page' : undefined}
          className={`w-full px-4 py-2.5 flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-700 ${
            selectedView === 'tasks' ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600' : ''
          }`}
        >
          <CheckSquare className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Tasks</span>
        </button>

        {/* My Shares */}
        <button
          onClick={() => {
            onSelectView('notes');
            onSelectFolder('my-shares');
            onSelectTag(null);
          }}
          aria-current={selectedFolderId === 'my-shares' ? 'page' : undefined}
          className={`w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 ${
            selectedFolderId === 'my-shares' ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600' : ''
          }`}
        >
          <div className="flex items-center space-x-3">
            <Share2 className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">My Shares</span>
          </div>
          {sharedByMeCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
              {sharedByMeCount}
            </span>
          )}
        </button>

        {/* Shared with me */}
        <button
          onClick={() => {
            onSelectView('notes');
            onSelectFolder('shared');
            onSelectTag(null);
          }}
          aria-current={selectedFolderId === 'shared' ? 'page' : undefined}
          className={`w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 ${
            selectedFolderId === 'shared' ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600' : ''
          }`}
        >
          <div className="flex items-center space-x-3">
            <Users className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Shared with me</span>
          </div>
          {sharedWithMeCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
              {sharedWithMeCount}
            </span>
          )}
        </button>

        {/* Service Accounts (admin only) */}
        {isAdmin && (
          <button
            onClick={() => {
              onSelectView('notes');
              onSelectFolder('service-accounts');
              onSelectTag(null);
            }}
            aria-current={selectedFolderId === 'service-accounts' ? 'page' : undefined}
            className={`w-full px-4 py-2.5 flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-700 ${
              selectedFolderId === 'service-accounts' ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600' : ''
            }`}
          >
            <Bot className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Service Accounts</span>
          </button>
        )}

        {/* Unfiled Notes */}
        <button
          onClick={() => {
            onSelectView('notes');
            onSelectFolder('unfiled');
            onSelectTag(null);
          }}
          aria-current={selectedFolderId === 'unfiled' ? 'page' : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setIsDragOverUnfiled(true);
          }}
          onDragLeave={() => setIsDragOverUnfiled(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOverUnfiled(false);
            try {
              const rawData = e.dataTransfer.getData('application/json');

              // Validate data isn't oversized
              if (rawData.length > 10000) {
                return;
              }

              const data = JSON.parse(rawData);

              // Validate schema: must be object with noteId string
              if (
                data &&
                typeof data === 'object' &&
                typeof data.noteId === 'string' &&
                data.noteId.length > 0 &&
                data.noteId.length < 100
              ) {
                handleNoteDrop('unfiled', data.noteId);
              }
            } catch (error) {
              // Silent fail for invalid drag data
              return;
            }
          }}
          className={`w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 ${
            selectedFolderId === 'unfiled' ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600' : ''
          } ${isDragOverUnfiled ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500' : ''}`}
        >
          <div className="flex items-center space-x-3">
            <FileQuestion className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Unfiled</span>
          </div>
          {unfiledCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
              {unfiledCount}
            </span>
          )}
        </button>

        {/* Folder Items */}
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</div>
        ) : folders.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No folders yet. Create one to get started!
          </div>
        ) : (
          folders.map((folder) => (
            <EditableListItem
              key={folder.id}
              id={folder.id}
              name={folder.name}
              count={folder.noteCount}
              renderIcon={(isEditing) => {
                if (isEditing) {
                  // Show icon picker when editing
                  const currentEditIcon = editingFolderIcons[folder.id] ?? folder.icon;
                  return (
                    <FolderIconPicker
                      selectedIcon={currentEditIcon}
                      onSelectIcon={(icon) => setEditingFolderIcons(prev => ({ ...prev, [folder.id]: icon }))}
                    />
                  );
                }
                // Show static icon in view mode
                return <FolderIcon icon={folder.icon} className="w-5 h-5 text-gray-400 dark:text-gray-500" />;
              }}
              isSelected={selectedFolderId === folder.id}
              ariaCurrent={selectedFolderId === folder.id ? 'page' : undefined}
              onSelect={() => onSelectFolder(folder.id)}
              onRename={handleRenameFolder}
              onDelete={handleDeleteFolder}
              onDrop={handleNoteDrop}
            />
          ))
        )}

        {/* Tags Section */}
        <div className="mt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setTagsExpanded(!tagsExpanded)}
            aria-expanded={tagsExpanded}
            aria-controls="tags-list"
            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <div className="flex items-center space-x-3">
              <Tag className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Tags</span>
            </div>
            {tagsExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            )}
          </button>

          {tagsExpanded && (
            <div id="tags-list">
              {tags.length === 0 ? (
                <div className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  No tags yet. Add tags to your notes!
                </div>
              ) : (
                tags.map((tag) => (
                  <EditableListItem
                    key={tag.id}
                    id={tag.id}
                    name={tag.name}
                    count={tag.noteCount}
                    isSelected={selectedTagId === tag.id}
                    ariaCurrent={selectedTagId === tag.id ? 'page' : undefined}
                    onSelect={() => onSelectTag(tag.id)}
                    onRename={handleRenameTag}
                    onDelete={handleDeleteTag}
                    indent={true}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Trash - at bottom */}
        <div className="border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => {
              onSelectView('notes');
              onSelectFolder('trash');
              onSelectTag(null);
            }}
            aria-current={selectedFolderId === 'trash' ? 'page' : undefined}
            className={`w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 ${
              selectedFolderId === 'trash' ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600' : ''
            }`}
          >
            <div className="flex items-center space-x-3">
              <Trash2 className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Trash</span>
            </div>
            {deletedCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-red-200 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full">
                {deletedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Version Footer */}
      <div className="mt-auto border-t border-gray-200 dark:border-gray-700 px-4 py-2 bg-gray-50 dark:bg-gray-900">
        <button
          onClick={() => {
            setShowWhatsNew(true);
            setShowNewBadge(false);
          }}
          className="w-full flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          {showNewBadge && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full text-[10px] font-medium animate-pulse">
              <Sparkles className="w-3 h-3" />
              NEW
            </span>
          )}
          <span>v{currentVersion}</span>
        </button>
      </div>

      {/* What's New Modal */}
      <WhatsNewModal
        isOpen={showWhatsNew}
        onClose={() => setShowWhatsNew(false)}
        currentVersion={currentVersion}
      />
    </nav>
  );
});
