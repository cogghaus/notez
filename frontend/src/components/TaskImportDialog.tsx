import { useState, useEffect, useMemo } from 'react';
import { X, FileText, Loader2, Check } from 'lucide-react';
import { tasksApi, foldersApi } from '../lib/api';
import type { ExtractedTask } from '../types';

interface TaskImportDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface Folder {
  id: string;
  name: string;
}

interface GroupedTasks {
  noteId: string;
  noteTitle: string;
  tasks: ExtractedTask[];
}

export default function TaskImportDialog({ onClose, onSuccess }: TaskImportDialogProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      const response = await foldersApi.list();
      setFolders(response.data.folders);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load folders:', error);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    setError('');
    setExtractedTasks([]);
    setSelectedNoteIds(new Set<string>());

    try {
      const params: any = {};
      if (selectedFolderId) {
        params.folderId = selectedFolderId;
      }

      const response = await tasksApi.scan(params);
      const tasks = response.data.tasks;
      const noteIds = new Set<string>(tasks.map((task: ExtractedTask) => task.noteId));

      // Batch state updates together
      setExtractedTasks(tasks);
      setSelectedNoteIds(noteIds);

      if (tasks.length === 0) {
        setError('No unchecked tasks found in notes.');
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Failed to scan notes:', error);
      setError(error.response?.data?.message || 'Failed to scan notes for tasks');
    } finally {
      setIsScanning(false);
    }
  };

  const handleImport = async () => {
    if (extractedTasks.length === 0 || selectedNoteIds.size === 0) return;

    setIsImporting(true);
    setError('');

    try {
      // Filter tasks based on selected notes
      const tasksToImport = extractedTasks.filter((task) => selectedNoteIds.has(task.noteId));

      // Send the actual task data to the backend
      await tasksApi.import({ tasks: tasksToImport });
      onSuccess();
      onClose();
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Failed to import tasks:', error);
      setError(error.response?.data?.message || 'Failed to import tasks');
    } finally {
      setIsImporting(false);
    }
  };

  const toggleNoteSelection = (noteId: string) => {
    const newSet = new Set(selectedNoteIds);
    if (newSet.has(noteId)) {
      newSet.delete(noteId);
    } else {
      newSet.add(noteId);
    }
    setSelectedNoteIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedNoteIds.size === groupedTasks.length) {
      setSelectedNoteIds(new Set<string>());
    } else {
      const allNoteIds = new Set<string>(groupedTasks.map((group) => group.noteId));
      setSelectedNoteIds(allNoteIds);
    }
  };

  // Group tasks by note using Map for better performance
  const groupedTasks: GroupedTasks[] = useMemo(() => {
    const groups: Record<string, GroupedTasks> = {};
    for (const task of extractedTasks) {
      if (!groups[task.noteId]) {
        groups[task.noteId] = {
          noteId: task.noteId,
          noteTitle: task.noteTitle,
          tasks: [],
        };
      }
      groups[task.noteId].tasks.push(task);
    }
    return Object.values(groups);
  }, [extractedTasks]);

  const selectedTaskCount = useMemo(
    () =>
      groupedTasks
        .filter((group) => selectedNoteIds.has(group.noteId))
        .reduce((sum, group) => sum + group.tasks.length, 0),
    [groupedTasks, selectedNoteIds]
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 pb-20 xl:pb-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[calc(var(--app-h,100dvh)-120px)] xl:max-h-[calc(var(--app-h,100dvh)*0.9)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Import Tasks from Notes
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Scan your notes to find all unchecked task items (markdown format: - [ ] Task).
            Tasks will be imported as standalone tasks with links back to their original notes.
          </p>

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* Folder Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Scan notes in folder (optional)
            </label>
            <select
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">All notes</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          {/* Scan Button */}
          {extractedTasks.length === 0 && (
            <button
              onClick={handleScan}
              disabled={isScanning}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scanning notes...
                </>
              ) : (
                'Scan for Tasks'
              )}
            </button>
          )}

          {/* Results */}
          {extractedTasks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Found {extractedTasks.length} task{extractedTasks.length === 1 ? '' : 's'} in{' '}
                  {groupedTasks.length} note{groupedTasks.length === 1 ? '' : 's'}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSelectAll}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    {selectedNoteIds.size === groupedTasks.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button
                    onClick={() => {
                      setExtractedTasks([]);
                      setSelectedNoteIds(new Set<string>());
                    }}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md">
                {groupedTasks.map((group) => {
                  const isSelected = selectedNoteIds.has(group.noteId);
                  return (
                    <div
                      key={group.noteId}
                      className="border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                    >
                      {/* Note header with checkbox */}
                      <div
                        className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => toggleNoteSelection(group.noteId)}
                      >
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600'
                              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {group.noteTitle}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {group.tasks.length} task{group.tasks.length === 1 ? '' : 's'}
                          </div>
                        </div>
                      </div>

                      {/* Task list (only show if note is selected) */}
                      {isSelected && (
                        <div className="bg-white dark:bg-gray-800">
                          {group.tasks.map((task, index) => (
                            <div
                              key={index}
                              className="p-3 pl-11 border-t border-gray-100 dark:border-gray-700/50"
                            >
                              <div className="text-sm text-gray-900 dark:text-white">
                                {task.title}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Import Actions */}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => {
                    setExtractedTasks([]);
                    setSelectedNoteIds(new Set<string>());
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={isImporting || selectedNoteIds.size === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${selectedTaskCount} Task${selectedTaskCount === 1 ? '' : 's'}`
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
