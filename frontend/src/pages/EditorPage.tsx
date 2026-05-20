import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FolderSidebar, type FolderSidebarHandle } from '../components/FolderSidebar';
import { NoteList, type NoteListHandle } from '../components/NoteList';
import { NoteEditor } from '../components/NoteEditor';
import TaskList from '../components/TaskList';
import KanbanBoard from '../components/KanbanBoard';
import TaskForm from '../components/TaskForm';
import { AppHeader } from '../components/AppHeader';
import { ResizeHandle } from '../components/ResizeHandle';
import { Menu, FileText, Edit3, CheckSquare, LayoutList, Columns } from 'lucide-react';
import { ServiceAccountDashboard } from '../components/ServiceAccountDashboard';
import { ServiceAccountWorkspace } from '../components/ServiceAccountWorkspace';
import type { Task } from '../types';

const VIRTUAL_FOLDER_IDS = new Set(['shared', 'my-shares', 'unfiled', 'trash', 'service-accounts']);

// localStorage keys
const SIDEBAR_COLLAPSED_KEY = 'notez-sidebar-collapsed';
const TASK_VIEW_MODE_KEY = 'notez-task-view-mode';
const SIDEBAR_WIDTH_KEY = 'notez-sidebar-width';
const LIST_WIDTH_KEY = 'notez-list-width';

// Panel width constraints
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 400;
const LIST_MIN = 240;
const LIST_MAX = 500;
const SA_WORKSPACE_WIDTH = 520; // Service account workspace: inner sidebar (224) + usable note list (~296)

export function EditorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedView, setSelectedView] = useState<'notes' | 'tasks'>('notes');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Initialize from localStorage
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === 'true';
  });
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'kanban'>(() => {
    const saved = localStorage.getItem(TASK_VIEW_MODE_KEY);
    if (saved) {
      return saved as 'list' | 'kanban';
    }
    // Default to kanban on desktop (xl = 1280px), list on mobile
    return window.innerWidth >= 1280 ? 'kanban' : 'list';
  });
  const [mobileView, setMobileView] = useState<'sidebar' | 'list' | 'editor'>('list');
  const [selectedServiceAccount, setSelectedServiceAccount] = useState<{ id: string; username: string } | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [kanbanKey, setKanbanKey] = useState(0); // For refreshing kanban
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= SIDEBAR_MIN && parsed <= SIDEBAR_MAX) {
        return parsed;
      }
    }
    return 256;
  });
  const [listWidth, setListWidth] = useState(() => {
    const saved = localStorage.getItem(LIST_WIDTH_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= LIST_MIN && parsed <= LIST_MAX) {
        return parsed;
      }
    }
    return 320;
  });
  const noteListRef = useRef<NoteListHandle>(null);
  const sidebarRef = useRef<FolderSidebarHandle>(null);

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Persist task view mode
  useEffect(() => {
    localStorage.setItem(TASK_VIEW_MODE_KEY, taskViewMode);
  }, [taskViewMode]);

  // Persist panel widths
  const saveSidebarWidth = useCallback(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const saveListWidth = useCallback(() => {
    localStorage.setItem(LIST_WIDTH_KEY, String(listWidth));
  }, [listWidth]);

  // Resize handlers
  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w + delta)));
  }, []);

  const handleListResize = useCallback((delta: number) => {
    setListWidth((w) => Math.min(LIST_MAX, Math.max(LIST_MIN, w + delta)));
  }, []);

  // Handle URL query parameters for note selection (from search or notifications)
  useEffect(() => {
    const noteId = searchParams.get('note');
    const folder = searchParams.get('folder');
    if (noteId) {
      setSelectedNoteId(noteId);
      setSelectedView('notes');
      if (folder) {
        setSelectedFolderId(folder);
        setSelectedTagId(null);
      }
      setMobileView('editor'); // Switch to editor on mobile when note is selected
      // Clear the query parameters after setting state
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Auto-switch to editor view on mobile when a note is selected
  useEffect(() => {
    if (selectedNoteId && selectedView === 'notes') {
      setMobileView('editor');
    }
  }, [selectedNoteId, selectedView]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+N - Create new note
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        // Trigger note creation through noteListRef
        noteListRef.current?.refresh(); // This will be replaced with createNote method if we add it
        // For now, we'll keep the querySelector as a fallback
        const createButton = document.querySelector('[title="New note"]') as HTMLButtonElement;
        createButton?.click();
      }

      // Ctrl+F - Focus search (currently using querySelector, could be improved with SearchBar ref)
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        searchInput?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNoteClick = (noteId: string) => {
    setSelectedView('notes');
    setSelectedNoteId(noteId);
    setMobileView('editor');
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-900">
      {/* Top Navigation */}
      <AppHeader />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden pb-20 xl:pb-0 ">
        {/* Folder Sidebar - Hidden on mobile unless mobileView === 'sidebar' */}
        <div
          className={`${mobileView === 'sidebar' ? 'block' : 'hidden'} xl:block flex-shrink-0`}
          style={{ width: sidebarCollapsed ? 48 : sidebarWidth }}
        >
          <FolderSidebar
            ref={sidebarRef}
            selectedFolderId={selectedFolderId}
            selectedTagId={selectedTagId}
            selectedView={selectedView}
            onSelectFolder={(folderId) => {
              setSelectedFolderId(folderId);
              setSelectedNoteId(null);
              setSelectedServiceAccount(null);
              // Virtual folders (null = All Notes) always switch to notes view.
              // Real folders keep the current view so tasks view can be filtered by folder.
              const isVirtual = folderId === null || VIRTUAL_FOLDER_IDS.has(folderId);
              if (isVirtual || selectedView !== 'tasks') {
                setSelectedView('notes');
              }
              setMobileView('list');
            }}
            onSelectTag={(tagId) => {
              setSelectedTagId(tagId);
              setSelectedNoteId(null);
              setSelectedServiceAccount(null); // Clear service account drill-down
              setSelectedView('notes'); // Switch to notes view when tag is selected
              setMobileView('list'); // Switch to list view on mobile after selecting tag
            }}
            onSelectView={(view) => {
              setSelectedView(view);
              setSelectedNoteId(null);
              setSelectedServiceAccount(null); // Clear service account drill-down
              setMobileView('list'); // Switch to list view on mobile after selecting view
            }}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            onNoteMoved={() => {
              // Refresh note list when a note is moved via drag-and-drop
              noteListRef.current?.refresh();
            }}
          />
        </div>

        {/* Sidebar Resize Handle */}
        {!sidebarCollapsed && (
          <ResizeHandle
            onResize={handleSidebarResize}
            onResizeEnd={saveSidebarWidth}
          />
        )}

        {/* Note List, Task List, or Service Account Views */}
        <div
          className={`${mobileView === 'list' ? 'block' : 'hidden'} xl:block flex-shrink-0`}
          style={selectedFolderId === 'service-accounts'
            ? selectedServiceAccount
              ? { width: SA_WORKSPACE_WIDTH, flex: '0 0 auto' }
              : { width: '100%', flex: 1 }
            : { width: listWidth }}
        >
          {/* Service Account Dashboard (no account selected yet) */}
          {selectedFolderId === 'service-accounts' && !selectedServiceAccount ? (
            <ServiceAccountDashboard
              onSelectAccount={(id, username) => setSelectedServiceAccount({ id, username })}
            />
          ) : selectedFolderId === 'service-accounts' && selectedServiceAccount ? (
            <ServiceAccountWorkspace
              accountId={selectedServiceAccount.id}
              username={selectedServiceAccount.username}
              onBack={() => setSelectedServiceAccount(null)}
              onSelectNote={(noteId) => {
                setSelectedNoteId(noteId);
              }}
              selectedNoteId={selectedNoteId}
            />
          ) : selectedView === 'notes' ? (
            <NoteList
              ref={noteListRef}
              folderId={selectedFolderId}
              tagId={selectedTagId}
              selectedNoteId={selectedNoteId}
              onSelectNote={setSelectedNoteId}
              onNoteCreated={() => {
                // Refresh sidebar counts after note creation
                sidebarRef.current?.refreshFolders();
              }}
            />
          ) : (
            <div className="flex flex-col h-full">
              {/* Task View Mode Toggle — hidden in service account mode (list view only) */}
              {selectedFolderId !== 'service-accounts' && (
                <div className="hidden xl:flex items-center justify-end gap-1 p-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setTaskViewMode('list')}
                    className={`p-1.5 rounded ${
                      taskViewMode === 'list'
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    title="List view"
                  >
                    <LayoutList className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setTaskViewMode('kanban')}
                    className={`p-1.5 rounded ${
                      taskViewMode === 'kanban'
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    title="Kanban view"
                  >
                    <Columns className="w-4 h-4" />
                  </button>
                </div>
              )}
              <TaskList
                onNoteClick={handleNoteClick}
                serviceAccountMode={selectedFolderId === 'service-accounts'}
                folderId={selectedFolderId && !VIRTUAL_FOLDER_IDS.has(selectedFolderId) ? selectedFolderId : null}
              />
            </div>
          )}
        </div>

        {/* List Resize Handle - hidden only for full-width dashboard */}
        {!(selectedFolderId === 'service-accounts' && !selectedServiceAccount) && (
          <ResizeHandle
            onResize={handleListResize}
            onResizeEnd={saveListWidth}
          />
        )}

        {/* Note Editor - Hidden on mobile unless mobileView === 'editor', hidden when dashboard is showing (no account selected) */}
        {selectedView === 'notes' && !(selectedFolderId === 'service-accounts' && !selectedServiceAccount) && (
          <div className={`flex-1 flex-col min-h-0 ${mobileView === 'editor' ? 'flex' : 'hidden'} xl:flex`}>
            <NoteEditor
              noteId={selectedNoteId}
              serviceAccountMode={selectedFolderId === 'service-accounts'}
              onNoteDeleted={(noteId) => {
                setSelectedNoteId(null);
                setMobileView('list'); // Return to list view on mobile after deleting
                noteListRef.current?.removeNote(noteId);
                sidebarRef.current?.refreshAll();
              }}
              onTagsChanged={() => {
                sidebarRef.current?.refreshTags();
              }}
              onNoteUpdated={(noteId, updates) => {
                noteListRef.current?.updateNote(noteId, updates);
                // Refresh folder counts if folder changed
                if (updates.folderId !== undefined) {
                  sidebarRef.current?.refreshFolders();
                }
              }}
              onNoteRestored={(noteId) => {
                setSelectedNoteId(null);
                setMobileView('list'); // Return to list view on mobile after restoring
                noteListRef.current?.removeNote(noteId); // Remove from trash list
                sidebarRef.current?.refreshAll(); // Refresh counts
              }}
            />
          </div>
        )}

        {/* Kanban Board - Only visible on desktop when tasks view + kanban mode (not in service account mode) */}
        {selectedView === 'tasks' && taskViewMode === 'kanban' && selectedFolderId !== 'service-accounts' && (
          <div className="hidden xl:flex flex-1 flex-col min-h-0">
            <KanbanBoard
              key={kanbanKey}
              onNoteClick={handleNoteClick}
              onTaskClick={(task) => setEditingTask(task)}
            />
          </div>
        )}
      </div>

      {/* Task Edit Modal */}
      {editingTask && (
        <TaskForm
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSuccess={() => {
            setEditingTask(null);
            // Refresh kanban board
            setKanbanKey((k) => k + 1);
          }}
        />
      )}

      {/* Mobile Bottom Navigation - Only visible on small screens */}
      <div className="xl:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-around py-4 px-2 min-h-[60px] z-50">
        <button
          onClick={() => setMobileView('sidebar')}
          className={`flex flex-col items-center px-4 py-2 rounded-md ${
            mobileView === 'sidebar'
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-xs mt-1">Folders</span>
        </button>
        <button
          onClick={() => {
            setMobileView('list');
            setSelectedView('notes');
          }}
          className={`flex flex-col items-center px-4 py-2 rounded-md ${
            mobileView === 'list' && selectedView === 'notes'
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-xs mt-1">Notes</span>
        </button>
        <button
          onClick={() => {
            setMobileView('list');
            setSelectedView('tasks');
          }}
          className={`flex flex-col items-center px-4 py-2 rounded-md ${
            mobileView === 'list' && selectedView === 'tasks'
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          <CheckSquare className="w-5 h-5" />
          <span className="text-xs mt-1">Tasks</span>
        </button>
        <button
          onClick={() => setMobileView('editor')}
          className={`flex flex-col items-center px-4 py-2 rounded-md ${
            mobileView === 'editor'
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : 'text-gray-600 dark:text-gray-400'
          }`}
          disabled={!selectedNoteId || selectedView !== 'notes'}
        >
          <Edit3 className="w-5 h-5" />
          <span className="text-xs mt-1">Editor</span>
        </button>
      </div>
    </div>
  );
}
