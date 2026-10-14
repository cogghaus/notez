import { useState } from 'react';
import { CheckCircle2, Circle, Hourglass, Clock, AlertCircle, FileText, Trash2, Edit, Link2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import type { Task } from '../types';

interface TaskItemProps {
  task: Task;
  onStatusChange?: (taskId: string, status: Task['status']) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  onNoteClick?: (noteId: string) => void;
  ownerLabel?: string;
}

/**
 * Only http and https links become anchors. The API already refuses other schemes;
 * this is defence in depth now that API clients and agents write task links.
 */
function isSafeLinkUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const priorityColors = {
  LOW: 'text-gray-500 dark:text-gray-400',
  MEDIUM: 'text-blue-500 dark:text-blue-400',
  HIGH: 'text-orange-500 dark:text-orange-400',
  URGENT: 'text-red-500 dark:text-red-400',
};

const priorityLabels = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export default function TaskItem({
  task,
  onStatusChange,
  onEdit,
  onDelete,
  onNoteClick,
  ownerLabel,
}: TaskItemProps) {
  const [showLinks, setShowLinks] = useState(false);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED' && task.status !== 'CANCELLED';
  const hasLinks = task.links && task.links.length > 0;

  const handleStatusClick = () => {
    if (!onStatusChange) return;
    if (task.status === 'PENDING') {
      onStatusChange(task.id, 'IN_PROGRESS');
    } else if (task.status === 'IN_PROGRESS') {
      onStatusChange(task.id, 'COMPLETED');
    } else if (task.status === 'WAITING') {
      // The wait is over: back to work
      onStatusChange(task.id, 'IN_PROGRESS');
    } else if (task.status === 'COMPLETED') {
      onStatusChange(task.id, 'PENDING');
    }
  };

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    if (diffDays < 7) return `Due in ${diffDays}d`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className={`group relative p-3 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
        isOverdue ? 'bg-red-50 dark:bg-red-900/10' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Status Checkbox */}
        <button
          onClick={handleStatusClick}
          className={`mt-0.5 flex-shrink-0 transition-transform ${onStatusChange ? 'hover:scale-110 cursor-pointer' : 'cursor-default'}`}
          title={`Status: ${task.status}`}
        >
          {task.status === 'COMPLETED' ? (
            <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-green-400" />
          ) : task.status === 'IN_PROGRESS' ? (
            <Circle className="w-5 h-5 text-blue-500 dark:text-blue-400 fill-blue-500/20 dark:fill-blue-400/20" />
          ) : task.status === 'WAITING' ? (
            <Hourglass className="w-5 h-5 text-purple-500 dark:text-purple-400" />
          ) : (
            <Circle className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          )}
        </button>

        {/* Task Content */}
        <div className="flex-1 min-w-0 pr-16">
          {/* Title */}
          <div className={`font-medium text-sm ${task.status === 'COMPLETED' ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
            {task.title}
          </div>

          {/* Owner Label (service account mode) */}
          {ownerLabel && (
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
              by {ownerLabel}
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
              {task.description}
            </div>
          )}

          {/* Metadata */}
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            {/* Priority */}
            <span className={`font-medium ${priorityColors[task.priority]}`}>
              {priorityLabels[task.priority]}
            </span>

            {/* Due Date */}
            {task.dueDate && (
              <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                {isOverdue ? (
                  <AlertCircle className="w-3 h-3" />
                ) : (
                  <Clock className="w-3 h-3" />
                )}
                {formatDueDate(task.dueDate)}
              </span>
            )}

            {/* Folder */}
            {task.folder && (
              <span className="truncate">
                {task.folder.name}
              </span>
            )}

            {/* Note Link */}
            {task.note && onNoteClick && (
              <button
                onClick={() => onNoteClick(task.note!.id)}
                className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title={`From note: ${task.note.title}`}
              >
                <FileText className="w-3 h-3" />
                <span className="truncate max-w-[100px]">{task.note.title}</span>
              </button>
            )}

            {/* Tags */}
            {task.tags && task.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {task.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.id}
                    className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs"
                  >
                    {tag.name}
                  </span>
                ))}
                {task.tags.length > 2 && (
                  <span className="text-xs">+{task.tags.length - 2}</span>
                )}
              </div>
            )}

            {/* Links indicator */}
            {hasLinks && (
              <button
                onClick={() => setShowLinks(!showLinks)}
                className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title={`${task.links!.length} link(s)`}
              >
                <Link2 className="w-3 h-3" />
                <span>{task.links!.length}</span>
                {showLinks ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            )}
          </div>

          {/* Expanded links section */}
          {hasLinks && showLinks && (
            <div className="mt-2 pl-1 space-y-1">
              {task.links!.map((link) =>
                isSafeLinkUrl(link.url) ? (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{link.title || link.url}</span>
                  </a>
                ) : (
                  // Not http(s): shown as text, never as a clickable href
                  <span
                    key={link.id}
                    className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                    title={link.url}
                  >
                    <Link2 className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{link.title || link.url}</span>
                  </span>
                )
              )}
            </div>
          )}
        </div>

        {/* Actions - Absolute positioned to prevent layout shift */}
        {/* On desktop: show on hover. On mobile/touch: always visible */}
        {(onEdit || onDelete) && (
          <div
            className={`absolute right-2 top-2 flex items-center gap-1
              transition-opacity duration-150
              bg-white/90 dark:bg-gray-800/90 rounded px-1 py-0.5
              opacity-100 sm:opacity-0 sm:group-hover:opacity-100`}
          >
            {onEdit && (
              <button
                onClick={() => onEdit(task)}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                title="Edit task"
              >
                <Edit className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(task.id)}
                className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                title="Delete task"
              >
                <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
