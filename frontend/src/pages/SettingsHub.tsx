import { useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { User, Bot, Shield, ArrowLeft, MessageSquare, Key, Webhook, Sparkles, Plug } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { ProfileSettings } from '../components/ProfileSettings';
import { AISettings } from '../components/AISettings';
import { AdminPanel } from '../components/AdminPanel';
import { AdminFeedbackPanel } from '../components/AdminFeedbackPanel';
import { ApiTokenSettings } from '../components/ApiTokenSettings';
import { AgentSettings } from '../components/AgentSettings';
import { WebhookSettings } from '../components/WebhookSettings';
import { McpConnectorSettings } from '../components/McpConnectorSettings';
import { useAuth } from '../contexts/AuthContext';

export type SettingsSection = 'profile' | 'ai' | 'agents' | 'tokens' | 'webhooks' | 'connectors' | 'admin' | 'feedback';

export const SECTION_CONFIG = {
  profile: {
    label: 'Profile',
    icon: User,
    description: 'Manage your account and avatar',
    adminOnly: false,
  },
  ai: {
    label: 'AI Configuration',
    icon: Bot,
    description: 'Configure AI providers and models',
    adminOnly: false,
  },
  agents: {
    label: 'My Agents',
    icon: Sparkles,
    description: 'Manage agent tokens with custom names, icons, and colors',
    adminOnly: false,
  },
  tokens: {
    label: 'API Tokens',
    icon: Key,
    description: 'Manage tokens for MCP and API access',
    adminOnly: false,
  },
  webhooks: {
    label: 'Webhooks',
    icon: Webhook,
    description: 'Push notifications for note and task changes',
    adminOnly: false,
  },
  connectors: {
    label: 'MCP Connectors',
    icon: Plug,
    description: 'Manage external app connections (e.g. Claude)',
    adminOnly: true,
  },
  admin: {
    label: 'Admin Panel',
    icon: Shield,
    description: 'Manage users and system settings',
    adminOnly: true,
  },
  feedback: {
    label: 'Feedback',
    icon: MessageSquare,
    description: 'Review user feedback and feature requests',
    adminOnly: true,
  },
};

export function SettingsHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { section } = useParams<{ section?: SettingsSection }>();

  // Determine active section from URL path parameter
  const rawSection = section as SettingsSection | undefined;
  const isValidSection = rawSection && SECTION_CONFIG[rawSection];
  const isAdminSection = rawSection === 'admin' || rawSection === 'feedback';
  const isUnauthorizedAdmin = isAdminSection && user?.role !== 'admin';

  // Default to 'profile' if invalid section or unauthorized
  const activeSection: SettingsSection =
    isValidSection && !isUnauthorizedAdmin ? rawSection : 'profile';

  // Navigate to section - updates URL path
  const navigateToSection = useCallback((newSection: SettingsSection) => {
    navigate(`/settings/${newSection}`, { replace: true });
  }, [navigate]);

  // Filter sections based on user role
  const availableSections = Object.entries(SECTION_CONFIG).filter(
    ([_key, config]) => !config.adminOnly || user?.role === 'admin'
  ) as [SettingsSection, typeof SECTION_CONFIG[SettingsSection]][];

  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return <ProfileSettings />;
      case 'ai':
        return <AISettings />;
      case 'agents':
        return <AgentSettings />;
      case 'tokens':
        return <ApiTokenSettings />;
      case 'webhooks':
        return <WebhookSettings />;
      case 'connectors':
        return user?.role === 'admin' ? <McpConnectorSettings /> : null;
      case 'admin':
        return user?.role === 'admin' ? <AdminPanel /> : null;
      case 'feedback':
        return user?.role === 'admin' ? <AdminFeedbackPanel /> : null;
      default:
        return <ProfileSettings />;
    }
  };

  const currentConfig = SECTION_CONFIG[activeSection];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      <AppHeader />

      {/* Column on phones (section picker above the content), row from md. In a row the picker's
          w-full squeezed main to 0px wide below md (mobile PR2, audit 2.2). */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 hidden md:block">
          <div className="p-4">
            <Link
              to="/"
              className="inline-flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-3"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Notes</span>
            </Link>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage your account and preferences
            </p>
          </div>
          <nav className="mt-2">
            {availableSections.map(([key, config]) => {
              const Icon = config.icon;
              const isActive = activeSection === key;

              return (
                <button
                  key={key}
                  onClick={() => navigateToSection(key)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 text-left transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-600 text-blue-700 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-l-4 border-transparent'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} />
                  <div>
                    <div className={`font-medium ${isActive ? 'text-blue-700 dark:text-blue-400' : ''}`}>
                      {config.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {config.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Mobile section selector */}
        <div className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 w-full">
          <Link
            to="/"
            className="inline-flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Notes</span>
          </Link>
          <label htmlFor="settings-section-select" className="sr-only">
            Select settings section
          </label>
          <select
            id="settings-section-select"
            name="settings-section"
            value={activeSection}
            onChange={(e) => navigateToSection(e.target.value as SettingsSection)}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white"
          >
            {availableSections.map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-4xl mx-auto py-8 px-4">
            {/* Section header */}
            <div className="mb-6">
              <div className="flex items-center space-x-3">
                {(() => {
                  const Icon = currentConfig.icon;
                  return <Icon className="w-6 h-6 text-gray-600 dark:text-gray-400" />;
                })()}
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {currentConfig.label}
                </h1>
              </div>
              <p className="mt-1 text-gray-500 dark:text-gray-400 ml-9">
                {currentConfig.description}
              </p>
            </div>

            {/* Section content */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              {renderContent()}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
