import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, Trash2, MessageSquare, RefreshCw, Sparkles, Users, Plug } from 'lucide-react';
import { notificationsApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { nextNavState, noteUrl } from '../lib/mobileNav';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  isRead: boolean;
  linkType: string;
  linkId: string;
  createdAt: string;
  readAt: string | null;
}

const DEFAULT_BUTTON_CLASS =
  'relative p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors';

interface NotificationBellProps {
  /** Override the button styling (the mobile top bar uses a 48px target). */
  buttonClassName?: string;
}

export function NotificationBell({ buttonClassName = DEFAULT_BUTTON_CLASS }: NotificationBellProps = {}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch unread count
  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000, // Refetch every 30 seconds
    enabled: !!user,
  });

  // Fetch notifications when dropdown is open
  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationsApi.list({ limit: 10 }),
    enabled: isOpen && !!user,
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => {
      showToast('Failed to mark notification as read', 'error');
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => {
      showToast('Failed to mark all as read', 'error');
    },
  });

  // Delete notification mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => {
      showToast('Failed to delete notification', 'error');
    },
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const unreadCount = unreadData?.data?.count ?? 0;
  const notifications: Notification[] = notificationsData?.data?.notifications ?? [];

  // Pushes carry the shell depth so Back and reload stay correct below xl (mobile nav)
  const go = (to: string) => navigate(to, { state: nextNavState() });

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read if not already
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }

    // Navigate based on link type
    if (notification.linkType === 'feedback') {
      // For admins, navigate to feedback section with the item ID in search params
      if (user?.role === 'admin') {
        go(`/settings/feedback?expandFeedback=${encodeURIComponent(notification.linkId)}`);
      }
      // For regular users, the notification itself contains the update info
      // No navigation needed - they can see the status update in the notification message
    } else if (notification.linkType === 'note' && notification.linkId) {
      // Navigate to the shared note and switch sidebar to "Shared with me"
      go(`${noteUrl('notes', notification.linkId)}&folder=shared`);
    } else if (notification.linkType === 'release') {
      // Navigate to changelog/What's New - clicking the version number in settings
      go('/settings/profile');
    } else if (notification.linkType === 'mcp_client') {
      // Navigate to MCP Connectors settings for approval
      go('/settings/connectors');
    }

    setIsOpen(false);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'NEW_FEEDBACK':
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case 'FEEDBACK_STATUS_CHANGE':
        return <RefreshCw className="w-4 h-4 text-green-500" />;
      case 'NOTE_SHARED':
        return <Users className="w-4 h-4 text-indigo-500" />;
      case 'NEW_RELEASE':
        return <Sparkles className="w-4 h-4 text-purple-500" />;
      case 'MCP_CLIENT_PENDING':
        return <Plug className="w-4 h-4 text-orange-500" />;
      default:
        return <Bell className="w-4 h-4 text-gray-500" />;
    }
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClassName}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No notifications yet
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`relative group ${
                      !notification.isRead
                        ? 'bg-blue-50/50 dark:bg-blue-900/10'
                        : ''
                    }`}
                  >
                    <button
                      onClick={() => handleNotificationClick(notification)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${
                            !notification.isRead
                              ? 'font-medium text-gray-900 dark:text-white'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}>
                            {notification.title}
                          </p>
                          {notification.message && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        {!notification.isRead && (
                          <div className="flex-shrink-0">
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Action buttons on hover */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-1">
                      {!notification.isRead && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsReadMutation.mutate(notification.id);
                          }}
                          className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors"
                          title="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(notification.id);
                        }}
                        className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  // Could navigate to a full notifications page if we add one
                }}
                className="w-full text-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
