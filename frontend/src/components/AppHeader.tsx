import { SearchBar } from './SearchBar';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { UserDropdown } from './UserDropdown';

export function AppHeader() {
  return (
    <nav data-kb-hide className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center space-x-2 md:space-x-4">
        <a href="/" className="flex items-center space-x-2 md:space-x-4 hover:opacity-80 transition-opacity">
          <img src="/icon-192x192.png" alt="Notez" className="w-8 h-8" />
          <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">Notez</h1>
        </a>
      </div>
      <div className="flex items-center space-x-2 md:space-x-4">
        <div className="hidden sm:block">
          <SearchBar />
        </div>
        <ThemeToggle />
        <NotificationBell />
        <UserDropdown />
      </div>
    </nav>
  );
}
