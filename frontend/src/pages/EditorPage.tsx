import { useState, useEffect, useLayoutEffect, useRef, useCallback, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FolderSidebar, type FolderSidebarHandle } from '../components/FolderSidebar';
import { NoteList, type NoteListHandle } from '../components/NoteList';
import { NoteEditor } from '../components/NoteEditor';
import TaskList from '../components/TaskList';
import KanbanBoard from '../components/KanbanBoard';
import TaskForm from '../components/TaskForm';
import { AppHeader } from '../components/AppHeader';
import { ResizeHandle } from '../components/ResizeHandle';
import { Folder, Tag, LayoutList, Columns } from 'lucide-react';
import { ServiceAccountDashboard } from '../components/ServiceAccountDashboard';
import { ServiceAccountWorkspace } from '../components/ServiceAccountWorkspace';
import { MobileTopBar } from '../components/mobile/MobileTopBar';
import { MobileBackBar } from '../components/mobile/MobileBackBar';
import { MobileTabBar } from '../components/mobile/MobileTabBar';
import { MobileSearch } from '../components/mobile/MobileSearch';
import { AccountSheet } from '../components/mobile/AccountSheet';
import { useLayoutClass } from '../lib/useLayoutClass';
import { useMobileNav } from '../lib/useMobileNav';
import { useNotesFilterLabel } from '../lib/useNotesFilterLabel';
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

/**
 * Resizable pane width, applied only at xl (the class `xl:w-[var(--pane-w)]`). Below xl every pane
 * is a single full-width view; an inline `width` there left a dead strip on phones (mobile PR2).
 */
function paneWidth(px: number): CSSProperties {
  return { '--pane-w': `${px}px` } as CSSProperties;
}

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
  const listPaneRef = useRef<HTMLDivElement>(null);

  // Below xl (Compact, and Medium until the rail lands in PR8) the mobile shell applies: navigation
  // state (tab, open note, Folders screen, account sheet) lives in the URL and history, not here.
  const shell = useLayoutClass() !== 'expanded';
  const nav = useMobileNav(shell);
  const filterLabel = useNotesFilterLabel(selectedFolderId, selectedTagId);

  const activeNoteId = shell ? nav.noteId : selectedNoteId;
  const activeView: 'notes' | 'tasks' = shell ? (nav.tab === 'tasks' ? 'tasks' : 'notes') : selectedView;
  const showEditor = shell && nav.noteId !== null;
  const mobileView: 'sidebar' | 'list' | 'editor' | 'search' = !shell
    ? 'list'
    : showEditor
      ? 'editor'
      : nav.foldersOpen
        ? 'sidebar'
        : nav.tab === 'search'
          ? 'search'
          : 'list';

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

  // Desktop: URL query parameters for note selection (from search or notifications) are read once and
  // cleared. Below xl the `note` parameter IS the editor state (see useMobileNav) and stays.
  useEffect(() => {
    if (shell) return;
    const noteId = searchParams.get('note');
    const folder = searchParams.get('folder');
    if (noteId) {
      setSelectedNoteId(noteId);
      setSelectedView('notes');
      if (folder) {
        setSelectedFolderId(folder);
        setSelectedTagId(null);
      }
      // Clear the query parameters after setting state
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, shell]);

  // Mobile: a `folder` parameter on a note link (notifications) selects that view for the list behind
  const folderParam = searchParams.get('folder');
  useEffect(() => {
    if (shell && folderParam) {
      setSelectedFolderId(folderParam);
      setSelectedTagId(null);
    }
  }, [shell, folderParam]);

  // Crossing xl keeps the open note and view: unfolding to a desktop width hands the URL state to
  // the desktop selection (the effect above), and folding back re-opens the note as a pushed screen.
  const wasShellRef = useRef(shell);
  useEffect(() => {
    if (shell && !wasShellRef.current && selectedNoteId && selectedView === 'notes') {
      nav.openNote(selectedNoteId);
    }
    wasShellRef.current = shell;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell]);
  useEffect(() => {
    if (!shell) return;
    setSelectedNoteId(nav.noteId);
    setSelectedView(nav.tab === 'tasks' ? 'tasks' : 'notes');
  }, [shell, nav.noteId, nav.tab]);

  // Closing the editor returns to the list where the user left it: same scroll position, focus on
  // the row that was open. The list stays mounted (hidden) while the editor shows. Scroll position
  // is tracked while the list is visible and put back when it reappears.
  const listScrollRef = useRef(0);
  const editorOpenRef = useRef(false);
  editorOpenRef.current = showEditor;
  const lastNoteIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!shell || showEditor) return;
    const scroller = listPaneRef.current?.querySelector<HTMLElement>('[data-note-list-scroll]');
    if (scroller && listScrollRef.current > 0) scroller.scrollTop = listScrollRef.current;
  }, [shell, showEditor]);

  useEffect(() => {
    // A different list (folder, tag or tab) starts at the top
    listScrollRef.current = 0;
  }, [selectedFolderId, selectedTagId, nav.tab]);

  useEffect(() => {
    const prev = lastNoteIdRef.current;
    lastNoteIdRef.current = nav.noteId;
    if (!shell || !prev || nav.noteId) return;
    const row = Array.from(document.querySelectorAll<HTMLElement>(`[data-note-id="${CSS.escape(prev)}"]`)).find(
      (el) => el.getClientRects().length > 0,
    );
    row?.focus({ preventScroll: true });
  }, [shell, nav.noteId]);

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

  /** Note picked in the list or in a service account workspace. */
  const selectNote = (noteId: string) => {
    if (shell) nav.openNote(noteId);
    else setSelectedNoteId(noteId);
  };

  /** Note opened from a task (links in the agenda and the kanban board). */
  const handleNoteClick = (noteId: string) => {
    if (shell) {
      nav.openNote(noteId);
      return;
    }
    setSelectedView('notes');
    setSelectedNoteId(noteId);
  };

  /** The editor closed itself (note deleted or restored): leave the pushed screen. */
  const leaveEditor = () => {
    setSelectedNoteId(null);
    if (shell) nav.back();
  };

  const editorMounted = shell ? nav.noteId !== null : selectedView === 'notes';
  const topTitle = nav.tab === 'tasks' ? 'Tasks' : nav.tab === 'search' ? 'Search' : filterLabel.label;
  const showTopBar = shell && (mobileView === 'list' || mobileView === 'search');

  return (
    // Height follows the visible viewport (--app-h, see lib/viewport.ts) so the on-screen keyboard
    // never covers the bottom of the note. Falls back to 100dvh until the variable is set.
    <div className="h-[var(--app-h,100dvh)] overflow-hidden flex flex-col bg-gray-100 dark:bg-gray-900">
      {/* Top Navigation: the desktop header at xl, the mobile top bar or Back row below it */}
      {!shell && <AppHeader />}
      {showTopBar && (
        <MobileTopBar
          title={topTitle}
          titleIcon={
            nav.tab === 'notes' ? (
              filterLabel.kind === 'tag' ? (
                <Tag className="w-5 h-5 flex-shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
              ) : (
                <Folder className="w-5 h-5 flex-shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
              )
            ) : undefined
          }
          onTitleClick={nav.tab === 'notes' ? nav.openFolders : undefined}
          onOpenAccount={nav.openAccount}
        />
      )}
      {shell && mobileView === 'sidebar' && <MobileBackBar title="Folders" onBack={nav.back} />}

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden" data-kb-pad>
        {/* Folder Sidebar - Hidden on mobile unless mobileView === 'sidebar' */}
        <div
          className={`${mobileView === 'sidebar' ? 'block' : 'hidden'} xl:block flex-shrink-0 w-full xl:w-[var(--pane-w)]`}
          style={paneWidth(sidebarCollapsed ? 48 : sidebarWidth)}
        >
          <FolderSidebar
            ref={sidebarRef}
            selectedFolderId={selectedFolderId}
            selectedTagId={selectedTagId}
            selectedView={activeView}
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
              if (shell) nav.leave(); // Back to the Notes list, filtered
            }}
            onSelectTag={(tagId) => {
              setSelectedTagId(tagId);
              setSelectedNoteId(null);
              setSelectedServiceAccount(null); // Clear service account drill-down
              setSelectedView('notes'); // Switch to notes view when tag is selected
              if (shell) nav.leave();
            }}
            onSelectView={(view) => {
              setSelectedView(view);
              setSelectedNoteId(null);
              setSelectedServiceAccount(null); // Clear service account drill-down
              if (shell && view === 'tasks') nav.replaceWithTab('tasks');
            }}
            // The full sidebar always shows in the phone Folders screen; a saved collapse is a desktop choice
            collapsed={sidebarCollapsed && !shell}
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

        {/* Note List, Task List, or Service Account Views (the Search tab has its own pane below) */}
        <div
          ref={listPaneRef}
          onScrollCapture={(e) => {
            // Remember where the notes list was scrolled while it is visible
            const el = e.target as HTMLElement;
            if (!editorOpenRef.current && el.hasAttribute('data-note-list-scroll')) listScrollRef.current = el.scrollTop;
          }}
          className={`${mobileView === 'list' ? 'block' : 'hidden'} xl:block ${
            selectedFolderId === 'service-accounts' && !selectedServiceAccount
              ? 'flex-1 w-full'
              : 'flex-shrink-0 w-full xl:w-[var(--pane-w)]'
          }`}
          style={selectedFolderId === 'service-accounts'
            ? selectedServiceAccount ? paneWidth(SA_WORKSPACE_WIDTH) : undefined
            : paneWidth(listWidth)}
        >
          {shell && nav.tab === 'search' ? null : selectedFolderId === 'service-accounts' && !selectedServiceAccount ? (
            // Service Account Dashboard (no account selected yet)
            <ServiceAccountDashboard
              onSelectAccount={(id, username) => setSelectedServiceAccount({ id, username })}
            />
          ) : selectedFolderId === 'service-accounts' && selectedServiceAccount ? (
            <ServiceAccountWorkspace
              accountId={selectedServiceAccount.id}
              username={selectedServiceAccount.username}
              onBack={() => setSelectedServiceAccount(null)}
              onSelectNote={selectNote}
              selectedNoteId={activeNoteId}
            />
          ) : activeView === 'notes' ? (
            <NoteList
              ref={noteListRef}
              folderId={selectedFolderId}
              tagId={selectedTagId}
              selectedNoteId={activeNoteId}
              onSelectNote={selectNote}
              onNoteCreated={() => {
                // Refresh sidebar counts after note creation
                sidebarRef.current?.refreshFolders();
              }}
            />
          ) : (
            <div className="flex flex-col h-full">
              {/* Task View Mode Toggle, hidden in service account mode (list view only) */}
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

        {/* Search tab (below xl). Stays mounted while a result is open so Back restores the results. */}
        {shell && nav.tab === 'search' && (
          <div className={`${mobileView === 'search' ? 'block' : 'hidden'} flex-1 min-w-0 w-full`}>
            <MobileSearch onOpenNote={nav.openNote} />
          </div>
        )}

        {/* List Resize Handle - hidden only for full-width dashboard */}
        {!(selectedFolderId === 'service-accounts' && !selectedServiceAccount) && (
          <ResizeHandle
            onResize={handleListResize}
            onResizeEnd={saveListWidth}
          />
        )}

        {/* Note Editor - Hidden on mobile unless mobileView === 'editor', hidden when dashboard is showing (no account selected) */}
        {editorMounted && !(selectedFolderId === 'service-accounts' && !selectedServiceAccount) && (
          <div className={`flex-1 flex-col min-h-0 min-w-0 ${mobileView === 'editor' ? 'flex' : 'hidden'} xl:flex`}>
            {shell && <MobileBackBar onBack={nav.back} hideWhileWriting />}
            <NoteEditor
              noteId={activeNoteId}
              serviceAccountMode={selectedFolderId === 'service-accounts'}
              onNoteDeleted={(noteId) => {
                noteListRef.current?.removeNote(noteId);
                sidebarRef.current?.refreshAll();
                leaveEditor(); // Return to the list after deleting
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
                noteListRef.current?.removeNote(noteId); // Remove from trash list
                sidebarRef.current?.refreshAll(); // Refresh counts
                leaveEditor(); // Return to the list after restoring
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

      {/* Mobile tab bar: list screens only; the editor and pushed pages are full screen */}
      {showTopBar && <MobileTabBar current={nav.tab} onSelect={nav.selectTab} />}

      <AccountSheet open={shell && nav.sheet === 'account'} onClose={nav.leave} onOpenSettings={nav.openSettings} />
    </div>
  );
}
