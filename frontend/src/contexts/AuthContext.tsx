import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../lib/api';

interface User {
  userId: string;
  username: string;
  email: string | null;
  role: string;
  isServiceAccount?: boolean;
  mustChangePassword?: boolean;
  oidcLinked?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setupNeeded: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  completeSsoLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);

  // Check if user is authenticated on mount
  useEffect(() => {
    checkSetupAndAuth();

    // Listen for auth failures from API interceptor
    const handleAuthFailure = () => {
      setUser(null);
    };

    window.addEventListener('auth-failure', handleAuthFailure);
    return () => window.removeEventListener('auth-failure', handleAuthFailure);
  }, []);

  const checkSetupAndAuth = async () => {
    try {
      // First check if setup is needed
      const setupResponse = await authApi.setupNeeded();
      setSetupNeeded(setupResponse.data.setupNeeded);

      if (setupResponse.data.setupNeeded) {
        // Setup needed, don't check auth
        setIsLoading(false);
        return;
      }

      // Setup not needed, check auth
      await checkAuth();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to check setup status:', error);
      setIsLoading(false);
    }
  };

  const checkAuth = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await authApi.me();
      setUser(response.data.user);
    } catch {
      // Token invalid or refresh failed - silently clear and redirect to login
      // Don't propagate error messages like "Refresh token not found" to UI
      localStorage.removeItem('accessToken');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (usernameOrEmail: string, password: string) => {
    const response = await authApi.login({ usernameOrEmail, password });
    const { accessToken, user: userData } = response.data;

    // Store access token
    localStorage.setItem('accessToken', accessToken);

    // Set user
    setUser(userData);
  };

  // After the SSO redirect the server has set only the refresh cookie;
  // exchange it for an access token, then load the user.
  const completeSsoLogin = async () => {
    const response = await authApi.refresh();
    localStorage.setItem('accessToken', response.data.accessToken);

    const me = await authApi.me();
    setUser(me.data.user);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Logout error:', error);
    } finally {
      // Clear local state regardless of API call result
      localStorage.removeItem('accessToken');
      setUser(null);
    }
  };

  const updateUser = (userData: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...userData } : null));
  };

  const refreshAuth = async () => {
    await checkSetupAndAuth();
  };

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    setupNeeded,
    login,
    completeSsoLogin,
    logout,
    updateUser,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
