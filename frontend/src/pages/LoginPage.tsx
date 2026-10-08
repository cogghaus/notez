import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../lib/api';

// Codes come from the SSO callback redirect (?sso_error=...); unknown codes get the generic text
const SSO_ERROR_MESSAGES: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  expired: 'The sign-in attempt expired. Please try again.',
  unverified_email: 'Your sign-in account has no verified email address. Please contact an administrator.',
  not_allowed: 'This account cannot use single sign-on.',
  deactivated: 'This account has been deactivated. Please contact an administrator.',
  conflict: 'This sign-in could not be matched to a Notez account. Please contact an administrator.',
  link_required:
    'This account must be connected before you can use single sign-on. Sign in with your password, then choose "Connect" under Settings, Profile.',
  invalid_claims: 'The sign-in provider returned an incomplete response. Please try again.',
  not_configured: 'Single sign-on is not available right now.',
  unavailable: 'Single sign-on is not available right now. Please try again later.',
};
const SSO_ERROR_FALLBACK = 'Single sign-on failed. Please try again.';

export function LoginPage() {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sso, setSso] = useState<{ enabled: boolean; providerName: string } | null>(null);
  const { login, completeSsoLogin, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Initialised from the URL so the password form never flashes on the SSO return
  const [isCompletingSso, setIsCompletingSso] = useState(
    () => searchParams.get('sso') === 'complete'
  );
  const ssoHandled = useRef(false);

  // Clear any stale tokens when landing on login page
  // This prevents issues where localStorage has a token but cookies are missing
  useEffect(() => {
    // Only clear if we're on login page and not authenticated
    // (authenticated users are redirected away by the effect below)
    if (!isAuthenticated) {
      localStorage.removeItem('accessToken');
    }
  }, []); // Run once on mount

  // Navigate after authentication state changes
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Show the SSO button only when the server has it configured
  useEffect(() => {
    authApi
      .oidcConfig()
      .then((response) => setSso(response.data))
      .catch(() => setSso(null));
  }, []);

  // Returning from the SSO provider: finish sign-in or show why it failed
  useEffect(() => {
    if (ssoHandled.current) return;
    const ssoStatus = searchParams.get('sso');
    const ssoError = searchParams.get('sso_error');
    if (!ssoStatus && !ssoError) return;
    ssoHandled.current = true;

    // Drop the query so a reload does not replay it
    setSearchParams({}, { replace: true });

    if (ssoError) {
      setError(SSO_ERROR_MESSAGES[ssoError] ?? SSO_ERROR_FALLBACK);
      return;
    }

    if (ssoStatus === 'complete') {
      setIsCompletingSso(true);
      completeSsoLogin()
        .catch(() => setError(SSO_ERROR_FALLBACK))
        .finally(() => setIsCompletingSso(false));
    }
  }, [searchParams, setSearchParams, completeSsoLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(usernameOrEmail, password);
      // Navigation is handled by useEffect after isAuthenticated updates
    } catch (err: any) {
      // Get the error message from the response, or provide a friendly fallback
      const errorMessage = err.response?.data?.message || 'Login failed. Please try again.';

      // Map technical errors to user-friendly messages
      if (errorMessage.includes('Invalid credentials')) {
        setError('Invalid username/email or password. Please try again.');
      } else if (errorMessage.includes('deactivated')) {
        setError('This account has been deactivated. Please contact an administrator.');
      } else {
        setError(errorMessage);
      }
      setIsLoading(false);
    }
  };

  if (isCompletingSso) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700">
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          Signing you in...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div className="text-center">
          <img src="/icon-192x192.png" alt="Notez" className="w-16 h-16 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Notez</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Sign in to your account
          </p>
        </div>

        {sso?.enabled && (
          <div className="mt-8 space-y-6">
            <a
              href={authApi.oidcLoginUrl}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-100 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign in with {sso.providerName}
            </a>
            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="flex-1 border-t border-gray-200 dark:border-gray-600" />
              <span className="text-xs text-gray-500 dark:text-gray-400">or</span>
              <div className="flex-1 border-t border-gray-200 dark:border-gray-600" />
            </div>
          </div>
        )}

        <form className={sso?.enabled ? 'space-y-6' : 'mt-8 space-y-6'} onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4" role="alert">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="usernameOrEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Username or Email
              </label>
              <input
                id="usernameOrEmail"
                name="usernameOrEmail"
                type="text"
                required
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="username or email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Password"
              />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Link
              to="/forgot-password"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
