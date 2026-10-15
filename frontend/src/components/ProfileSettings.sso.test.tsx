import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const oidcConfig = vi.fn();
const oidcLink = vi.fn();
const oidcLinkConfirm = vi.fn();
const refreshAuth = vi.fn();
let currentUser: Record<string, unknown>;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: currentUser, updateUser: vi.fn(), refreshAuth }),
}));

vi.mock('../lib/api', () => ({
  authApi: {
    oidcConfig: () => oidcConfig(),
    oidcLink: (...args: unknown[]) => oidcLink(...args),
    oidcLinkConfirm: () => oidcLinkConfirm(),
  },
  profileApi: {},
}));

vi.mock('./ConfirmDialog', () => ({ useConfirm: () => vi.fn() }));

import { ProfileSettings } from './ProfileSettings';

function ShowSearch() {
  return <div data-testid="search">{useLocation().search}</div>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/settings/profile"
          element={
            <>
              <ProfileSettings />
              <ShowSearch />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProfileSettings: Sign in with Pocket ID', () => {
  const originalLocation = window.location;
  const assign = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = {
      userId: 'u1',
      username: 'adam',
      email: 'a@example.com',
      role: 'admin',
      isServiceAccount: false,
      oidcLinked: false,
    };
    oidcConfig.mockResolvedValue({ data: { enabled: true, providerName: 'Pocket ID' } });
    refreshAuth.mockResolvedValue(undefined);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('offers Connect when not linked, and navigates to the provider URL', async () => {
    oidcLink.mockResolvedValue({ data: { url: 'https://id.example.com/authorize?x=1' } });
    renderAt('/settings/profile');

    expect(await screen.findByText('Not connected yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Pocket ID' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://id.example.com/authorize?x=1'));
  });

  it('shows an error and re-enables Connect if starting the connection fails', async () => {
    oidcLink.mockRejectedValue({ response: { data: { message: 'Single sign-on is unavailable' } } });
    renderAt('/settings/profile');

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Pocket ID' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Single sign-on is unavailable');
    expect(assign).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Connect Pocket ID' }) as HTMLButtonElement).disabled).toBe(false);
  });

  // Started on the LAN name: the server refuses (the provider would return to the APP_URL host,
  // where this half-started connection cannot finish) and names the address to use instead.
  it('on wrong_host, says where to connect and links there instead of navigating', async () => {
    oidcLink.mockRejectedValue({
      response: { status: 409, data: { code: 'wrong_host', url: 'https://notez.example.com/settings/profile' } },
    });
    renderAt('/settings/profile');

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Pocket ID' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('notez.example.com');
    const link = screen.getByRole('link', { name: 'notez.example.com' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://notez.example.com/settings/profile');
    expect(assign).not.toHaveBeenCalled();
    expect(oidcLink).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Connect Pocket ID' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('on wrong_host naming the address this page is already on, retries once with canonical', async () => {
    const here = `${window.location.origin}/settings/profile`;
    oidcLink
      .mockRejectedValueOnce({ response: { status: 409, data: { code: 'wrong_host', url: here } } })
      .mockResolvedValueOnce({ data: { url: 'https://id.example.com/authorize?x=2' } });
    renderAt('/settings/profile');

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Pocket ID' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://id.example.com/authorize?x=2'));
    expect(oidcLink).toHaveBeenCalledTimes(2);
    expect(oidcLink).toHaveBeenLastCalledWith(true);
  });

  it('the wrong_host hint goes away like any other message when another action starts', async () => {
    oidcLink.mockRejectedValue({
      response: { status: 409, data: { code: 'wrong_host', url: 'https://notez.example.com/settings/profile' } },
    });
    renderAt('/settings/profile');
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Pocket ID' }));
    expect(await screen.findByRole('link', { name: 'notez.example.com' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Edit username' }));

    expect(screen.queryByRole('link', { name: 'notez.example.com' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('if the canonical retry fails too, shows the error and re-enables Connect', async () => {
    const here = `${window.location.origin}/settings/profile`;
    oidcLink
      .mockRejectedValueOnce({ response: { status: 409, data: { code: 'wrong_host', url: here } } })
      .mockRejectedValueOnce({ response: { status: 503, data: { message: 'Single sign-on is unavailable' } } });
    renderAt('/settings/profile');

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Pocket ID' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Single sign-on is unavailable');
    expect(oidcLink).toHaveBeenCalledTimes(2);
    expect(assign).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Connect Pocket ID' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('on wrong_host with an address that is not http(s), shows no link', async () => {
    oidcLink.mockRejectedValue({
      response: { status: 409, data: { code: 'wrong_host', url: 'javascript:alert(1)' } },
    });
    renderAt('/settings/profile');

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Pocket ID' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).queryByRole('link')).toBeNull();
    expect(alert.textContent).not.toContain('javascript');
    expect(assign).not.toHaveBeenCalled();
  });

  it('shows the connected state and no Connect button when already linked', async () => {
    currentUser.oidcLinked = true;
    renderAt('/settings/profile');

    expect(await screen.findByText('Connected to Pocket ID')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect Pocket ID' })).toBeNull();
  });

  it('hides the card when SSO is not configured', async () => {
    oidcConfig.mockResolvedValue({ data: { enabled: false, providerName: 'Pocket ID' } });
    renderAt('/settings/profile');

    await waitFor(() => expect(oidcConfig).toHaveBeenCalled());
    expect(screen.queryByText('Sign in with Pocket ID')).toBeNull();
  });

  it('confirms the link on return (?sso_link=confirm), refreshes the user and clears the query', async () => {
    oidcLinkConfirm.mockResolvedValue({ data: { linked: true } });
    renderAt('/settings/profile?sso_link=confirm');

    expect((await screen.findByRole('status')).textContent).toContain('Pocket ID connected');
    expect(oidcLinkConfirm).toHaveBeenCalledTimes(1);
    expect(refreshAuth).toHaveBeenCalled();
    expect(screen.getByTestId('search').textContent).toBe('');
  });

  it('shows the reason when the confirm is refused', async () => {
    oidcLinkConfirm.mockRejectedValue({ response: { status: 403, data: { code: 'not_allowed' } } });
    renderAt('/settings/profile?sso_link=confirm');

    expect((await screen.findByRole('alert')).textContent).toContain("can't use Pocket ID");
    expect(refreshAuth).not.toHaveBeenCalled();
  });

  it('maps an ?sso_error from the provider redirect to a message', async () => {
    renderAt('/settings/profile?sso_error=cancelled');

    expect((await screen.findByRole('alert')).textContent).toBe('Sign-in with Pocket ID was cancelled.');
    expect(oidcLinkConfirm).not.toHaveBeenCalled();
  });
});
