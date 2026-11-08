import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Settings, Shield, LogOut, MessageSquarePlus } from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { useAuth } from '../contexts/AuthContext';
import { FeedbackModal } from './FeedbackModal';

export function UserDropdown() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const avatarButtonRef = useRef<HTMLButtonElement>(null);

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

  // Close dropdown on escape key
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

  if (!user) return null;

  const handleNavigation = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    setIsOpen(false);
    logout();
  };

  const handleFeedbackClick = () => {
    setIsOpen(false);
    setIsFeedbackOpen(true);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={avatarButtonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <UserAvatar
          userId={user.userId}
          username={user.username}
          size="sm"
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* User info header */}
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {user.username}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {user.role === 'admin' ? 'Administrator' : 'User'}
            </p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => handleNavigation('/settings/profile')}
              className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <User className="w-4 h-4" />
              <span>Profile</span>
            </button>

            <button
              onClick={() => handleNavigation('/settings/ai')}
              className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>

            <button
              onClick={handleFeedbackClick}
              className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>Share Feedback</span>
            </button>

            {user.role === 'admin' && (
              <button
                onClick={() => handleNavigation('/settings/admin')}
                className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Shield className="w-4 h-4" />
                <span>Admin Panel</span>
              </button>
            )}
          </div>

          {/* Logout - separated */}
          <div className="border-t border-gray-200 dark:border-gray-700 py-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        returnFocusTo={avatarButtonRef.current}
      />
    </div>
  );
}
