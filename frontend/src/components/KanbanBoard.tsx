import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Circle, PlayCircle, Hourglass, CheckCircle2, XCircle, Clock, AlertCircle, FileText, Link2 } from 'lucide-react';
import { tasksApi } from '../lib/api';
import { useToast } from './Toast';
import type { Task, TaskStatus, TaskPriority } from '../types';

interface KanbanBoardProps {
  onNoteClick?: (noteId: string) => void;
  onTaskClick?: (task: Task) => void;
}

interface KanbanColumn {
  status: TaskStatus;
  title: string;
  icon: React.ReactNode;
  bgColor: string;
  headerColor: string;
}

const COLUMNS: KanbanColumn[] = [
  {
    status: 'PENDING',
    title: 'Pending',
    icon: <Circle className="w-4 h-4" />,
    bgColor: 'bg-gray-50 dark:bg-gray-900/50',
    headerColor: 'text-gray-600 dark:text-gray-400',
  },
  {
    status: 'IN_PROGRESS',
    title: 'In Progress',
    icon: <PlayCircle className="w-4 h-4" />,
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    headerColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    // Always visible (an open status), so a waiting task is never hidden
    status: 'WAITING',
    title: 'Waiting',
    icon: <Hourglass className="w-4 h-4" />,
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    headerColor: 'text-purple-600 dark:text-purple-400',
  },
  {
    status: 'COMPLETED',
    title: 'Completed',
    icon: <CheckCircle2 className="w-4 h-4" />,
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    headerColor: 'text-green-600 dark:text-green-400',
  },
  {
    status: 'CANCELLED',
    title: 'Cancelled',
    icon: <XCircle className="w-4 h-4" />,
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    headerColor: 'text-red-600 dark:text-red-400',
  },
];

const priorityColors: Record<TaskPriority, string> = {
  LOW: 'border-l-gray-400',
  MEDIUM: 'border-l-blue-400',
  HIGH: 'border-l-orange-400',
  URGENT: 'border-l-red-500',
};

const priorityBadgeColors: Record<TaskPriority, string> = {
  LOW: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  MEDIUM: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  HIGH: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
  URGENT: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
};

export default function KanbanBoard({ onNoteClick, onTaskClick }: KanbanBoardProps) {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const dragCounter = useRef<Record<string, number>>({});
  const taskRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      // Load all tasks without status filter for kanban view
      const response = await tasksApi.list({ limit: 100 });
      setTasks(response.data.tasks);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load tasks:', error);
      showToast('Failed to load tasks', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter((task) => task.status === status);
  };

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggingTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    // Add dragging class after a short delay for visual feedback
    setTimeout(() => {
      const element = document.getElementById(`kanban-card-${task.id}`);
      element?.classList.add('opacity-50');
    }, 0);
  };

  const handleDragEnd = () => {
    setDraggingTask(null);
    setDragOverColumn(null);
    dragCounter.current = {};
    // Remove opacity from all cards
    const elements = document.querySelectorAll('[id^="kanban-card-"]');
    elements.forEach((el) => el.classList.remove('opacity-50'));
  };

  const handleDragEnter = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    dragCounter.current[status] = (dragCounter.current[status] || 0) + 1;
    if (draggingTask && draggingTask.status !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDragLeave = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    dragCounter.current[status] = (dragCounter.current[status] || 0) - 1;
    if (dragCounter.current[status] <= 0) {
      dragCounter.current[status] = 0;
      if (dragOverColumn === status) {
        setDragOverColumn(null);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, newStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    dragCounter.current = {};

    if (!draggingTask || draggingTask.status === newStatus) {
      return;
    }

    const taskId = draggingTask.id;
    setIsUpdating(taskId);

    // Optimistic update
    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.id === taskId ? { ...task, status: newStatus } : task
      )
    );

    try {
      await tasksApi.updateStatus(taskId, newStatus);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to update task status:', error);
      showToast('Failed to move task', 'error');
      // Revert on failure
      loadTasks();
    } finally {
      setIsUpdating(null);
      setDraggingTask(null);
    }
  };

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Derive visible columns once — used in render, keyboard nav, and drag/drop
  const visibleColumns = COLUMNS.filter((col) => showCompleted || (col.status !== 'COMPLETED' && col.status !== 'CANCELLED'));

  // Keyboard navigation: move task to adjacent column
  const moveTaskToColumn = useCallback(async (task: Task, direction: 'left' | 'right') => {
    const cols = COLUMNS.filter((col) => showCompleted || (col.status !== 'COMPLETED' && col.status !== 'CANCELLED'));
    const currentIndex = cols.findIndex((col) => col.status === task.status);
    const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;

    if (newIndex < 0 || newIndex >= cols.length) {
      // User tried to move beyond visible columns — nudge them to enable the toggle
      if (direction === 'right' && !showCompleted) {
        showToast('Enable "Show completed" to move tasks further', 'info');
      }
      return;
    }

    const newStatus = cols[newIndex].status;
    setIsUpdating(task.id);

    // Optimistic update
    setTasks((prevTasks) =>
      prevTasks.map((t) =>
        t.id === task.id ? { ...t, status: newStatus } : t
      )
    );

    try {
      await tasksApi.updateStatus(task.id, newStatus);
      // Focus the task in its new column after state update
      setTimeout(() => {
        taskRefs.current[task.id]?.focus();
      }, 100);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to update task status:', error);
      showToast('Failed to move task', 'error');
      loadTasks();
    } finally {
      setIsUpdating(null);
    }
  }, [showToast, showCompleted]);

  // Handle keyboard events on task cards
  const handleTaskKeyDown = useCallback((e: React.KeyboardEvent, task: Task) => {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        moveTaskToColumn(task, 'left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        moveTaskToColumn(task, 'right');
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onTaskClick?.(task);
        break;
    }
  }, [moveTaskToColumn, onTaskClick]);

  const isOverdue = (task: Task) => {
    return (
      task.dueDate &&
      new Date(task.dueDate) < new Date() &&
      task.status !== 'COMPLETED' &&
      task.status !== 'CANCELLED'
    );
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-100 dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Kanban Board</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Drag tasks or use <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">←</kbd> <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">→</kbd> arrow keys to move between columns
          </p>
        </div>
        <label htmlFor="kanban-show-completed" className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            id="kanban-show-completed"
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          <span className="text-gray-700 dark:text-gray-300">Show completed &amp; cancelled</span>
        </label>
      </div>

      {/* Kanban Columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-4 h-full min-w-max">
          {visibleColumns.map((column) => {
            const columnTasks = getTasksByStatus(column.status);
            const isDragOver = dragOverColumn === column.status;

            return (
              <div
                key={column.status}
                role="region"
                aria-label={`${column.title} column, ${columnTasks.length} tasks`}
                className={`flex flex-col w-72 rounded-lg ${column.bgColor} ${
                  isDragOver ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900' : ''
                } transition-all`}
                onDragEnter={(e) => handleDragEnter(e, column.status)}
                onDragLeave={(e) => handleDragLeave(e, column.status)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.status)}
              >
                {/* Column Header */}
                <div className={`flex items-center gap-2 px-3 py-2 ${column.headerColor}`}>
                  {column.icon}
                  <span className="font-medium">{column.title}</span>
                  <span className="ml-auto text-sm bg-white dark:bg-gray-800 px-2 py-0.5 rounded-full">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Column Content */}
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                  {columnTasks.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                      {isDragOver ? 'Drop here' : 'No tasks'}
                    </div>
                  ) : (
                    columnTasks.map((task) => (
                      <div
                        id={`kanban-card-${task.id}`}
                        key={task.id}
                        ref={(el) => { taskRefs.current[task.id] = el; }}
                        tabIndex={0}
                        role="button"
                        aria-label={`${task.title}, ${task.priority} priority${task.dueDate ? `, due ${formatDueDate(task.dueDate)}` : ''}. Use left and right arrow keys to move between columns.`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task)}
                        onDragEnd={handleDragEnd}
                        onClick={() => onTaskClick?.(task)}
                        onKeyDown={(e) => handleTaskKeyDown(e, task)}
                        className={`
                          bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700
                          border-l-4 ${priorityColors[task.priority]}
                          p-3 cursor-grab active:cursor-grabbing
                          hover:shadow-md transition-shadow
                          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900
                          ${isUpdating === task.id ? 'opacity-50' : ''}
                          ${isOverdue(task) ? 'ring-1 ring-red-500' : ''}
                        `}
                      >
                        {/* Task Title */}
                        <h3 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2">
                          {task.title}
                        </h3>

                        {/* Task Meta */}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          {/* Priority Badge */}
                          <span className={`px-1.5 py-0.5 rounded ${priorityBadgeColors[task.priority]}`}>
                            {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                          </span>

                          {/* Due Date */}
                          {task.dueDate && (
                            <span
                              className={`flex items-center gap-1 ${
                                isOverdue(task)
                                  ? 'text-red-600 dark:text-red-400 font-medium'
                                  : 'text-gray-500 dark:text-gray-400'
                              }`}
                            >
                              {isOverdue(task) ? (
                                <AlertCircle className="w-3 h-3" />
                              ) : (
                                <Clock className="w-3 h-3" />
                              )}
                              {formatDueDate(task.dueDate)}
                            </span>
                          )}
                        </div>

                        {/* Additional Info Row */}
                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          {/* Folder */}
                          {task.folder && (
                            <span className="truncate max-w-[80px]" title={task.folder.name}>
                              {task.folder.name}
                            </span>
                          )}

                          {/* Note Link */}
                          {task.note && onNoteClick && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onNoteClick(task.note!.id);
                              }}
                              className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                              title={`From note: ${task.note.title}`}
                            >
                              <FileText className="w-3 h-3" />
                            </button>
                          )}

                          {/* Links indicator */}
                          {task.links && task.links.length > 0 && (
                            <span className="flex items-center gap-1" title={`${task.links.length} link(s)`}>
                              <Link2 className="w-3 h-3" />
                              {task.links.length}
                            </span>
                          )}

                          {/* Tags */}
                          {task.tags && task.tags.length > 0 && (
                            <div className="flex gap-1 ml-auto">
                              {task.tags.slice(0, 1).map((tag) => (
                                <span
                                  key={tag.id}
                                  className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs"
                                >
                                  {tag.name}
                                </span>
                              ))}
                              {task.tags.length > 1 && (
                                <span className="text-xs">+{task.tags.length - 1}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
