import { useState, useEffect } from 'react';
import { Plus, Download, Filter, X, ArrowUpDown } from 'lucide-react';
import { tasksApi, foldersApi, serviceAccountsApi, type TaskSortBy, type TaskSortOrder } from '../lib/api';
import type { Task, TaskStats } from '../types';
import TaskItem from './TaskItem';
import TaskForm from './TaskForm';
import TaskImportDialog from './TaskImportDialog';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

interface TaskListProps {
  onNoteClick?: (noteId: string) => void;
  serviceAccountMode?: boolean;
  folderId?: string | null;
}

interface Folder {
  id: string;
  name: string;
}

export default function TaskList({ onNoteClick, serviceAccountMode, folderId }: TaskListProps) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<string>('');
  const [selectedFolder, setSelectedFolder] = useState<string>(folderId ?? '');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<TaskSortBy>('priority');
  const [sortOrder, setSortOrder] = useState<TaskSortOrder>('desc');

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    setSelectedFolder(folderId ?? '');
  }, [folderId]);

  useEffect(() => {
    loadTasks();
    loadStats();
    loadFolders();
  }, [showCompleted, selectedPriority, selectedFolder, showOverdueOnly, sortBy, sortOrder]);

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      if (serviceAccountMode) {
        const response = await serviceAccountsApi.listTasks({ limit: 100 });
        setTasks(response.data.tasks);
      } else {
        const params: any = { limit: 100, sortBy, sortOrder };

        if (!showCompleted) {
          params.status = ['PENDING', 'IN_PROGRESS'];
        }

        if (selectedPriority) {
          params.priority = selectedPriority;
        }

        if (selectedFolder) {
          params.folderId = selectedFolder;
        }

        if (showOverdueOnly) {
          params.overdue = true;
        }

        const response = await tasksApi.list(params);
        setTasks(response.data.tasks);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load tasks:', error);
      showToast('Failed to load tasks', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await tasksApi.stats();
      setStats(response.data);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load task stats:', error);
    }
  };

  const loadFolders = async () => {
    try {
      const response = await foldersApi.list();
      setFolders(response.data.folders);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load folders:', error);
    }
  };

  const handleStatusChange = async (taskId: string, status: Task['status']) => {
    try {
      await tasksApi.updateStatus(taskId, status);
      await loadTasks();
      await loadStats();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to update task status:', error);
      showToast('Failed to update task status', 'error');
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setIsFormOpen(true);
  };

  const handleDelete = async (taskId: string) => {
    const confirmed = await confirm({
      title: 'Delete Task',
      message: 'Are you sure you want to delete this task?',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await tasksApi.delete(taskId);
      await loadTasks();
      await loadStats();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to delete task:', error);
      showToast('Failed to delete task', 'error');
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingTask(null);
  };

  const handleFormSuccess = () => {
    loadTasks();
    loadStats();
  };

  const handleImportSuccess = () => {
    loadTasks();
    loadStats();
  };

  const clearFilters = () => {
    setShowCompleted(false);
    setSelectedPriority('');
    setSelectedFolder('');
    setShowOverdueOnly(false);
  };

  const hasActiveFilters = selectedPriority || selectedFolder || showOverdueOnly;

  return (
    <div className="w-full md:w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {serviceAccountMode ? 'Service Account Tasks' : 'Tasks'}
          </h2>
          {!serviceAccountMode && (
            <div className="flex gap-1">
              <button
                onClick={() => setIsImportOpen(true)}
                className="p-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                title="Import tasks from notes"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsFormOpen(true)}
                className="p-1.5 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                title="New task"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        {stats && !serviceAccountMode && (
          <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
              <div className="font-medium text-blue-700 dark:text-blue-400">{stats.pendingTasks}</div>
              <div className="text-blue-600 dark:text-blue-500">Pending</div>
            </div>
            <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
              <div className="font-medium text-yellow-700 dark:text-yellow-400">{stats.inProgressTasks}</div>
              <div className="text-yellow-600 dark:text-yellow-500">In Progress</div>
            </div>
            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded">
              <div className="font-medium text-red-700 dark:text-red-400">{stats.overdueTasks}</div>
              <div className="text-red-600 dark:text-red-500">Overdue</div>
            </div>
          </div>
        )}

        {/* Filter Toggle */}
        {!serviceAccountMode && <button
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
        >
          <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                {[selectedPriority, selectedFolder, showOverdueOnly].filter(Boolean).length}
              </span>
            )}
          </span>
          {hasActiveFilters && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearFilters();
              }}
              className="p-1 hover:bg-gray-300 dark:hover:bg-gray-500 rounded"
              title="Clear filters"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </button>}

        {/* Filter Panel */}
        {!serviceAccountMode && isFilterOpen && (
          <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md space-y-3">
            {/* Show Completed */}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-gray-700 dark:text-gray-300">Show completed</span>
            </label>

            {/* Overdue Only */}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showOverdueOnly}
                onChange={(e) => setShowOverdueOnly(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-gray-700 dark:text-gray-300">Overdue only</span>
            </label>

            {/* Priority Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Priority
              </label>
              <select
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="">All</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            {/* Folder Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Folder
              </label>
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="">All</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Options */}
            <div className="border-t border-gray-200 dark:border-gray-600 pt-3 mt-3">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Sort</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as TaskSortBy)}
                  className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="priority">Priority</option>
                  <option value="dueDate">Due Date</option>
                  <option value="createdAt">Created</option>
                  <option value="title">Title</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as TaskSortOrder)}
                  className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="desc">{sortBy === 'title' ? 'Z-A' : sortBy === 'dueDate' ? 'Latest First' : 'High to Low'}</option>
                  <option value="asc">{sortBy === 'title' ? 'A-Z' : sortBy === 'dueDate' ? 'Earliest First' : 'Low to High'}</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto pb-20 xl:pb-0">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading...
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {serviceAccountMode
              ? 'No service account tasks found.'
              : hasActiveFilters || showCompleted
              ? 'No tasks match your filters.'
              : 'No pending tasks! Tap + to create one or import from notes.'}
          </div>
        ) : (
          <div>
            {tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onStatusChange={serviceAccountMode ? undefined : handleStatusChange}
                onEdit={serviceAccountMode ? undefined : handleEdit}
                onDelete={serviceAccountMode ? undefined : handleDelete}
                onNoteClick={onNoteClick}
                ownerLabel={serviceAccountMode ? (task as any).user?.username : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Mobile FAB - Floating Action Button for adding tasks on mobile */}
      {!serviceAccountMode && (
        <button
          onClick={() => setIsFormOpen(true)}
          className="xl:hidden fixed right-4 bottom-24 w-14 h-14 bg-blue-600 dark:bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors flex items-center justify-center z-40"
          title="New task"
          aria-label="Create new task"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Modals */}
      {isFormOpen && (
        <TaskForm
          task={editingTask}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}

      {isImportOpen && (
        <TaskImportDialog
          onClose={() => setIsImportOpen(false)}
          onSuccess={handleImportSuccess}
        />
      )}
    </div>
  );
}
