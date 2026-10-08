import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const completeSsoLogin = vi.fn();
const oidcConfig = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    completeSsoLogin,
    isAuthenticated: false,
  }),
}));

vi.mock('../lib/api', () => ({
  authApi: {
    oidcConfig: () => oidcConfig(),
    oidcLoginUrl: '/api/auth/oidc/login',
  },
}));

import { LoginPage } from './LoginPage';

function ShowSearch() {
  return <div data-testid="search">{useLocation().search}</div>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/login"
          element={
            <>
              <LoginPage />
              <ShowSearch />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('LoginPage single sign-on', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    oidcConfig.mockResolvedValue({ data: { enabled: true, providerName: 'Pocket ID' } });
  });

  it('shows the Pocket ID button, linking to the SSO start, when SSO is enabled', async () => {
    renderAt('/login');

    const link = await screen.findByRole('link', { name: 'Sign in with Pocket ID' });
    expect(link.getAttribute('href')).toBe('/api/auth/oidc/login');
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('hides the button and still shows the password form when SSO is off', async () => {
    oidcConfig.mockResolvedValue({ data: { enabled: false, providerName: 'Pocket ID' } });
    renderAt('/login');

    expect(await screen.findByLabelText('Password')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Pocket ID/ })).toBeNull();
  });

  it('still shows the password form when the SSO config request fails', async () => {
    oidcConfig.mockRejectedValue(new Error('network'));
    renderAt('/login');

    expect(await screen.findByLabelText('Password')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Pocket ID/ })).toBeNull();
  });

  it('maps a known sso_error code to its message and clears the query', async () => {
    renderAt('/login?sso_error=link_required');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('one-time setup');
    await waitFor(() => expect(screen.getByTestId('search').textContent).toBe(''));
  });

  it('shows the generic message for an unknown sso_error code (never echoes it)', async () => {
    renderAt('/login?sso_error=<script>');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Signing in with Pocket ID did not work. Please try again.');
  });

  it('finishes SSO sign-in on ?sso=complete without flashing the form', async () => {
    completeSsoLogin.mockReturnValue(new Promise(() => {})); // still in progress
    renderAt('/login?sso=complete');

    expect(screen.queryByLabelText('Password')).toBeNull();
    await waitFor(() => expect(completeSsoLogin).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole('status')).textContent).toBe('Signing you in...');
  });

  it('falls back to the form with an error if finishing SSO fails', async () => {
    completeSsoLogin.mockRejectedValue(new Error('refresh failed'));
    renderAt('/login?sso=complete');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Signing in with Pocket ID did not work. Please try again.');
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });
});
