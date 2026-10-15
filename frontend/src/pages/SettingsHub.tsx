import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { User, Bot, Shield, ArrowLeft, ChevronRight, MessageSquare, Key, Webhook, Sparkles, Plug } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { MobileBackBar } from '../components/mobile/MobileBackBar';
import { ProfileSettings } from '../components/ProfileSettings';
import { AISettings } from '../components/AISettings';
import { AdminPanel } from '../components/AdminPanel';
import { AdminFeedbackPanel } from '../components/AdminFeedbackPanel';
import { ApiTokenSettings } from '../components/ApiTokenSettings';
import { AgentSettings } from '../components/AgentSettings';
import { WebhookSettings } from '../components/WebhookSettings';
import { McpConnectorSettings } from '../components/McpConnectorSettings';
import { useAuth } from '../contexts/AuthContext';
import { useShell } from '../lib/useLayoutClass';
import { useMobileNav } from '../lib/useMobileNav';

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
  const location = useLocation();
  // Below xl the phone list and page branch applies (Medium shares the Compact shell until PR8)
  const compact = useShell();
  const nav = useMobileNav(compact);
  const { section } = useParams<{ section?: SettingsSection }>();

  // Determine active section from URL path parameter
  const rawSection = section as SettingsSection | undefined;
  const isValidSection = rawSection !== undefined && Object.hasOwn(SECTION_CONFIG, rawSection);
  // adminOnly comes from the config, so a section added there is covered without touching this check
  const isUnauthorizedAdmin = isValidSection && SECTION_CONFIG[rawSection].adminOnly && user?.role !== 'admin';
  const sectionAllowed = isValidSection && !isUnauthorizedAdmin;

  // Default to 'profile' if invalid section or unauthorized
  const activeSection: SettingsSection = sectionAllowed ? rawSection : 'profile';

  // Phone: a section the user cannot open (unknown, or admin only) is not a page; go to the list
  const badSection = compact && rawSection !== undefined && !sectionAllowed;
  useEffect(() => {
    if (badSection) navigate('/settings', { replace: true, state: location.state });
  }, [badSection, navigate, location.state]);

  // Navigate to section - updates URL path. The router state (history depth) is carried over so
  // Back keeps working after switching sections.
  const navigateToSection = useCallback((newSection: SettingsSection) => {
    navigate(`/settings/${newSection}`, { replace: true, state: location.state });
  }, [navigate, location.state]);

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

  // Below xl (Compact, and Medium until PR8): the two-column layout becomes a list page and a page per
  // section, each a history entry (spec 8). From xl up the two columns below render.
  if (compact) {
    return (
      <div className="h-[var(--app-h,100dvh)] overflow-hidden flex flex-col bg-gray-100 dark:bg-gray-900">
        <main className="flex-1 min-h-0 flex flex-col">
          {!sectionAllowed ? (
            <>
              <MobileBackBar title="Settings" onBack={nav.leave} />
              <nav aria-label="Settings sections" className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-white dark:bg-gray-900">
                {availableSections.map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => nav.openSettingsSection(key)}
                      className="w-full min-h-14 px-4 py-2 flex items-center gap-3 text-left border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Icon className="w-5 h-5 flex-shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-base text-gray-900 dark:text-white">{config.label}</span>
                        <span className="block text-sm text-gray-600 dark:text-gray-400">{config.description}</span>
                      </span>
                      <ChevronRight className="w-5 h-5 flex-shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    </button>
                  );
                })}
              </nav>
            </>
          ) : (
            <>
              <MobileBackBar title={currentConfig.label} onBack={nav.leave} />
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">{renderContent()}</div>
              </div>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      <AppHeader />

      {/* Two columns from `medium` (600px) up. Until PR8 gives Medium its own shell, only xl reaches this branch. */}
      <div className="flex-1 flex flex-col medium:flex-row">
        {/* Sidebar */}
        <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 hidden medium:block">
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
