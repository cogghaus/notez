import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReplaceSearchParams } from '../lib/mobileNav';
import {
  Bug,
  Lightbulb,
  MessageSquare,
  Eye,
  CheckCircle,
  XCircle,
  ExternalLink,
  Clock,
  ChevronDown,
  ChevronUp,
  Rocket,
  Filter,
  RefreshCw,
  Check,
} from 'lucide-react';
import { feedbackApi, type FeedbackStatus, type FeedbackType } from '../lib/api';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { formatDistanceToNow } from 'date-fns';

interface FeedbackSubmission {
  id: string;
  type: FeedbackType;
  title: string;
  description: string;
  status: FeedbackStatus;
  category: string | null;
  priority: string | null;
  adminNotes: string | null;
  githubIssueUrl: string | null;
  shipped: boolean;
  shippedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  publishedAt: string | null;
  user: {
    id: string;
    username: string;
  };
}

const STATUS_CONFIG: Record<FeedbackStatus, { label: string; color: string; icon: typeof Clock }> = {
  NEW: { label: 'New', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Clock },
  REVIEWED: { label: 'Reviewed', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Eye },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  PUBLISHED: { label: 'Published', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', icon: ExternalLink },
  DECLINED: { label: 'Declined', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  'nice-to-have': { label: 'Nice to Have', color: 'text-gray-600 dark:text-gray-400' },
  'helpful': { label: 'Helpful', color: 'text-yellow-600 dark:text-yellow-400' },
  'critical': { label: 'Critical', color: 'text-red-600 dark:text-red-400' },
};

export function AdminFeedbackPanel() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const replaceSearchParams = useReplaceSearchParams(); // keeps the history depth the mobile shell relies on
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FeedbackType | ''>('');
  const [filterStatus, setFilterStatus] = useState<FeedbackStatus | ''>('');
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Fetch feedback list
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'feedback', filterType, filterStatus],
    queryFn: () => feedbackApi.listAll({
      type: filterType || undefined,
      status: filterStatus || undefined,
      limit: 50,
    }),
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['admin', 'feedback', 'stats'],
    queryFn: () => feedbackApi.getStats(),
  });

  // Update status mutation (separate from notes to avoid blocking UI)
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) =>
      feedbackApi.update(id, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'feedback'],
        refetchType: 'all',
      });
    },
    onError: () => {
      showToast('Failed to update feedback status', 'error');
    },
  });

  // Update notes mutation (used by auto-save)
  const updateNotesMutation = useMutation({
    mutationFn: ({ id, adminNotes }: { id: string; adminNotes: string }) =>
      feedbackApi.update(id, { adminNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
    },
    onError: () => {
      showToast('Failed to save admin notes', 'error');
    },
  });

  // Ship mutation
  const shipMutation = useMutation({
    mutationFn: (id: string) => feedbackApi.markShipped(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
    },
    onError: () => {
      showToast('Failed to mark as shipped', 'error');
    },
  });

  // Unship mutation
  const unshipMutation = useMutation({
    mutationFn: (id: string) => feedbackApi.unmarkShipped(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'feedback'],
        refetchType: 'all',
      });
    },
    onError: () => {
      showToast('Failed to unmark shipped', 'error');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => feedbackApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
    },
    onError: () => {
      showToast('Failed to delete feedback', 'error');
    },
  });

  const submissions: FeedbackSubmission[] = data?.data?.submissions ?? [];
  const stats = statsData?.data;
  const newCount = data?.data?.newCount ?? 0;

  // Store the expand ID from URL to persist across data loads
  const [pendingExpandId, setPendingExpandId] = useState<string | null>(() => {
    // Check URL on initial mount
    const params = new URLSearchParams(window.location.search);
    return params.get('expandFeedback');
  });

  // Handle expand from URL (notification click)
  useEffect(() => {
    // If we have a pending expand and submissions have loaded
    if (pendingExpandId && submissions.length > 0) {
      const submission = submissions.find(s => s.id === pendingExpandId);
      if (submission) {
        setExpandedId(pendingExpandId);
        // Load notes for expanded item
        if (!(pendingExpandId in adminNotes)) {
          setAdminNotes(prev => ({ ...prev, [pendingExpandId]: submission.adminNotes || '' }));
        }
        // Scroll to the item after a brief delay
        setTimeout(() => {
          document.getElementById(`feedback-${pendingExpandId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
      // Clear pending expand (only once)
      setPendingExpandId(null);
      // Clear URL param
      replaceSearchParams({});
    }
  }, [pendingExpandId, submissions, replaceSearchParams]);

  // Auto-save notes with debounce
  const debouncedSaveNotes = useCallback((id: string, notes: string) => {
    // Clear existing timer
    if (debounceTimers.current[id]) {
      clearTimeout(debounceTimers.current[id]);
    }

    setSaveStatus(prev => ({ ...prev, [id]: 'saving' }));

    debounceTimers.current[id] = setTimeout(() => {
      updateNotesMutation.mutate(
        { id, adminNotes: notes },
        {
          onSuccess: () => {
            setSaveStatus(prev => ({ ...prev, [id]: 'saved' }));
            // Clear saved status after 2 seconds
            setTimeout(() => {
              setSaveStatus(prev => {
                const newStatus = { ...prev };
                delete newStatus[id];
                return newStatus;
              });
            }, 2000);
          },
          onError: () => {
            setSaveStatus(prev => ({ ...prev, [id]: 'error' }));
          },
        }
      );
    }, 1000); // 1 second debounce
  }, [updateNotesMutation]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const handleStatusChange = (id: string, status: FeedbackStatus) => {
    updateStatusMutation.mutate({ id, status });
  };

  const handleNotesChange = (id: string, notes: string) => {
    setAdminNotes(prev => ({ ...prev, [id]: notes }));
    debouncedSaveNotes(id, notes);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleStatClick = (type: 'new' | 'bugs' | 'features' | 'total') => {
    switch (type) {
      case 'new':
        setFilterStatus('NEW');
        setFilterType('');
        break;
      case 'bugs':
        setFilterType('BUG');
        setFilterStatus('');
        break;
      case 'features':
        setFilterType('FEATURE');
        setFilterStatus('');
        break;
      case 'total':
        setFilterType('');
        setFilterStatus('');
        break;
    }
  };

  const toggleExpanded = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      // Load existing notes into state
      const submission = submissions.find(s => s.id === id);
      if (submission && !(id in adminNotes)) {
        setAdminNotes(prev => ({ ...prev, [id]: submission.adminNotes || '' }));
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards - Clickable to filter */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => handleStatClick('total')}
            className={`bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-left transition-all hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-600 ${
              filterType === '' && filterStatus === '' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <MessageSquare className="w-5 h-5" />
              <span className="text-2xl font-bold">{stats.total}</span>
            </div>
            <p className="text-sm text-blue-600/70 dark:text-blue-400/70 mt-1">Total Submissions</p>
          </button>
          <button
            onClick={() => handleStatClick('new')}
            className={`bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 text-left transition-all hover:ring-2 hover:ring-yellow-300 dark:hover:ring-yellow-600 ${
              filterStatus === 'NEW' ? 'ring-2 ring-yellow-500' : ''
            }`}
          >
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <Clock className="w-5 h-5" />
              <span className="text-2xl font-bold">{stats.byStatus?.NEW ?? 0}</span>
            </div>
            <p className="text-sm text-yellow-600/70 dark:text-yellow-400/70 mt-1">Awaiting Review</p>
          </button>
          <button
            onClick={() => handleStatClick('bugs')}
            className={`bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-left transition-all hover:ring-2 hover:ring-red-300 dark:hover:ring-red-600 ${
              filterType === 'BUG' ? 'ring-2 ring-red-500' : ''
            }`}
          >
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Bug className="w-5 h-5" />
              <span className="text-2xl font-bold">{stats.byType?.BUG ?? 0}</span>
            </div>
            <p className="text-sm text-red-600/70 dark:text-red-400/70 mt-1">Bug Reports</p>
          </button>
          <button
            onClick={() => handleStatClick('features')}
            className={`bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 text-left transition-all hover:ring-2 hover:ring-amber-300 dark:hover:ring-amber-600 ${
              filterType === 'FEATURE' ? 'ring-2 ring-amber-500' : ''
            }`}
          >
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Lightbulb className="w-5 h-5" />
              <span className="text-2xl font-bold">{stats.byType?.FEATURE ?? 0}</span>
            </div>
            <p className="text-sm text-amber-600/70 dark:text-amber-400/70 mt-1">Feature Requests</p>
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters:</span>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="filter-type" className="sr-only">Filter by type</label>
          <select
            id="filter-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FeedbackType | '')}
            className="px-3 py-1.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md"
          >
            <option value="">All Types</option>
            <option value="BUG">Bug Reports</option>
            <option value="FEATURE">Feature Requests</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="filter-status" className="sr-only">Filter by status</label>
          <select
            id="filter-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FeedbackStatus | '')}
            className="px-3 py-1.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md"
          >
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="APPROVED">Approved</option>
            <option value="PUBLISHED">Published</option>
            <option value="DECLINED">Declined</option>
          </select>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>

        {newCount > 0 && (
          <button
            onClick={() => handleStatClick('new')}
            className="px-2 py-1 text-xs font-medium bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
          >
            {newCount} new
          </button>
        )}
      </div>

      {/* Submissions List */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Loading submissions...</p>
          </div>
        ) : submissions.length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No feedback submissions yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {submissions.map((submission) => {
              const isExpanded = expandedId === submission.id;
              const statusConfig = STATUS_CONFIG[submission.status];
              const StatusIcon = statusConfig.icon;

              return (
                <div key={submission.id} id={`feedback-${submission.id}`} className="bg-white dark:bg-gray-800">
                  {/* Summary Row */}
                  <button
                    onClick={() => toggleExpanded(submission.id)}
                    className="w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                  >
                    {/* Type Icon */}
                    <div className={`flex-shrink-0 p-2 rounded-lg ${
                      submission.type === 'BUG'
                        ? 'bg-red-100 dark:bg-red-900/30'
                        : 'bg-amber-100 dark:bg-amber-900/30'
                    }`}>
                      {submission.type === 'BUG' ? (
                        <Bug className="w-5 h-5 text-red-600 dark:text-red-400" />
                      ) : (
                        <Lightbulb className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      )}
                    </div>

                    {/* Title & Meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-gray-900 dark:text-white truncate">
                          {submission.title}
                        </h4>
                        {submission.shipped && (
                          <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                            <Rocket className="w-3 h-3" />
                            Shipped
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <span>by {submission.user.username}</span>
                        <span>{formatDistanceToNow(new Date(submission.createdAt), { addSuffix: true })}</span>
                        {submission.category && (
                          <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded">
                            {submission.category}
                          </span>
                        )}
                        {submission.priority && (
                          <span className={`text-xs font-medium ${PRIORITY_CONFIG[submission.priority]?.color || ''}`}>
                            {PRIORITY_CONFIG[submission.priority]?.label || submission.priority}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      <span>{statusConfig.label}</span>
                    </div>

                    {/* Expand Icon */}
                    <div className="flex-shrink-0 text-gray-400">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                      {/* Description */}
                      <div className="mb-4">
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</h5>
                        <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                          {submission.description}
                        </p>
                      </div>

                      {/* Admin Notes - Auto-save */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">Admin Notes</h5>
                          {saveStatus[submission.id] && (
                            <span className={`flex items-center gap-1 text-xs ${
                              saveStatus[submission.id] === 'saving' ? 'text-gray-500 dark:text-gray-400' :
                              saveStatus[submission.id] === 'saved' ? 'text-green-600 dark:text-green-400' :
                              'text-red-600 dark:text-red-400'
                            }`}>
                              {saveStatus[submission.id] === 'saving' && (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  Saving...
                                </>
                              )}
                              {saveStatus[submission.id] === 'saved' && (
                                <>
                                  <Check className="w-3 h-3" />
                                  Saved
                                </>
                              )}
                              {saveStatus[submission.id] === 'error' && 'Save failed'}
                            </span>
                          )}
                        </div>
                        <textarea
                          value={adminNotes[submission.id] ?? submission.adminNotes ?? ''}
                          onChange={(e) => handleNotesChange(submission.id, e.target.value)}
                          placeholder="Add internal notes about this submission..."
                          rows={3}
                          className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Notes auto-save as you type</p>
                      </div>

                      {/* GitHub Issue Link */}
                      {submission.githubIssueUrl && (
                        <div className="mb-4">
                          <a
                            href={submission.githubIssueUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <ExternalLink className="w-4 h-4" />
                            View GitHub Issue
                          </a>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</span>
                        <div className="flex flex-wrap gap-2">
                          {(['NEW', 'REVIEWED', 'APPROVED', 'DECLINED'] as FeedbackStatus[]).map((status) => (
                            <button
                              key={status}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(submission.id, status);
                              }}
                              disabled={updateStatusMutation.isPending || submission.status === status}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                submission.status === status
                                  ? STATUS_CONFIG[status].color
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                              } disabled:opacity-50`}
                            >
                              {STATUS_CONFIG[status].label}
                            </button>
                          ))}
                        </div>

                        <div className="flex-1" />

                        {/* Ship/Unship Button */}
                        {!submission.shipped && submission.status === 'APPROVED' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              shipMutation.mutate(submission.id);
                            }}
                            disabled={shipMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                          >
                            <Rocket className="w-4 h-4" />
                            Mark as Shipped
                          </button>
                        )}
                        {submission.shipped && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              unshipMutation.mutate(submission.id);
                            }}
                            disabled={unshipMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                          >
                            <Rocket className="w-4 h-4" />
                            Unmark Shipped
                          </button>
                        )}

                        {/* Delete Button */}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const confirmed = await confirm({
                              title: 'Delete Feedback',
                              message: 'Are you sure you want to delete this submission?',
                              confirmText: 'Delete',
                              variant: 'danger',
                            });
                            if (confirmed) {
                              deleteMutation.mutate(submission.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
