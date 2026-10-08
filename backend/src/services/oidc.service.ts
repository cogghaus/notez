import crypto from 'crypto';
import * as oidc from 'openid-client';
import { prisma } from '../lib/db.js';
import { hashPassword } from './auth.service.js';
import { RESERVED_USERNAMES } from '../utils/validation.schemas.js';

/**
 * Single sign-on through an OpenID Connect provider (Pocket ID).
 *
 * Linking policy (decided 2026-10-08, hardened after red-team review the same day):
 * 1. A user already linked to the provider `sub` signs straight in.
 * 2. Otherwise the provider's verified email is matched (case-insensitive) to an
 *    existing regular user once, and the `sub` is stored; later logins use `sub` only.
 *    Admin accounts are never linked by email: a provider account whose email was
 *    changed to the admin's would otherwise inherit admin rights. Admins link from
 *    inside a signed-in session instead (linkOidcToUser, Settings > Profile).
 * 3. Otherwise a regular (non-admin) Notez user is created.
 *
 * Who may sign in is decided by group membership: the provider client is restricted
 * to a group, and when OIDC_REQUIRED_GROUP is set the `groups` claim is checked here too.
 *
 * Service accounts and deactivated users can never sign in this way, and an account
 * already linked to a different `sub` is never re-linked.
 */

export const OIDC_PROVIDER_NAME = 'Pocket ID';
const DISCOVERY_TIMEOUT_SECONDS = 10;

export type OidcErrorCode =
  | 'not_configured'
  | 'invalid_claims'
  | 'unverified_email'
  | 'not_allowed'
  | 'deactivated'
  | 'conflict'
  | 'link_required';

export class OidcLoginError extends Error {
  constructor(public readonly code: OidcErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'OidcLoginError';
  }
}

interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  requiredGroup: string | null;
}

let warnedInvalidUrl = false;

/** Read OIDC settings from the environment; null when SSO is not configured. */
export function getOidcSettings(env: NodeJS.ProcessEnv = process.env): OidcSettings | null {
  const issuer = env.OIDC_ISSUER?.trim();
  const clientId = env.OIDC_CLIENT_ID?.trim();
  const clientSecret = env.OIDC_CLIENT_SECRET?.trim();
  const appUrl = env.APP_URL?.trim();
  if (!issuer || !clientId || !clientSecret || !appUrl) return null;

  let redirectUri: string;
  try {
    redirectUri = new URL('/api/auth/oidc/callback', appUrl).toString();
    new URL(issuer);
  } catch {
    // A malformed APP_URL or issuer disables SSO instead of turning every SSO
    // endpoint (including the public config probe) into a 500
    if (!warnedInvalidUrl) {
      warnedInvalidUrl = true;
      console.warn('SSO disabled: APP_URL or OIDC_ISSUER is not a valid absolute URL');
    }
    return null;
  }

  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    requiredGroup: env.OIDC_REQUIRED_GROUP?.trim() || null,
  };
}

export function isOidcEnabled(): boolean {
  return getOidcSettings() !== null;
}

function scopeFor(settings: OidcSettings): string {
  return settings.requiredGroup ? 'openid profile email groups' : 'openid profile email';
}

// Discovery is fetched once and reused; a failed fetch is not cached so the next
// login attempt retries (the provider may simply have been briefly unreachable).
let configPromise: Promise<oidc.Configuration> | null = null;

async function getClientConfig(settings: OidcSettings): Promise<oidc.Configuration> {
  if (!configPromise) {
    configPromise = oidc
      .discovery(new URL(settings.issuer), settings.clientId, settings.clientSecret, undefined, {
        timeout: DISCOVERY_TIMEOUT_SECONDS,
      })
      .catch((error: unknown) => {
        configPromise = null;
        throw error;
      });
  }
  return configPromise;
}

/** Per-login values kept in a short-lived signed cookie between redirect and callback. */
export interface OidcTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** Set when a signed-in user is linking their account rather than signing in */
  linkUserId?: string;
}

export async function beginLogin(
  linkUserId?: string
): Promise<{ url: string; transaction: OidcTransaction }> {
  const settings = getOidcSettings();
  if (!settings) throw new OidcLoginError('not_configured');

  const config = await getClientConfig(settings);
  const transaction: OidcTransaction = {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    codeVerifier: oidc.randomPKCECodeVerifier(),
    ...(linkUserId ? { linkUserId } : {}),
  };

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: settings.redirectUri,
    scope: scopeFor(settings),
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(transaction.codeVerifier),
    code_challenge_method: 'S256',
  });

  return { url: url.toString(), transaction };
}

export interface OidcIdentity {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  preferredUsername?: string;
}

/**
 * Exchange the authorization code. openid-client validates state, nonce, PKCE,
 * issuer, audience and the ID token signature.
 *
 * @param callbackQuery the raw query string the provider redirected back with
 */
export async function completeLogin(
  callbackQuery: string,
  transaction: OidcTransaction
): Promise<OidcIdentity> {
  const settings = getOidcSettings();
  if (!settings) throw new OidcLoginError('not_configured');

  const config = await getClientConfig(settings);

  // Build the callback URL from the configured redirect URI, not the request Host,
  // so it matches what was registered regardless of the reverse proxy in front.
  const callbackUrl = new URL(settings.redirectUri);
  callbackUrl.search = callbackQuery;

  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: transaction.codeVerifier,
    expectedState: transaction.state,
    expectedNonce: transaction.nonce,
    idTokenExpected: true,
  });

  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new OidcLoginError('invalid_claims');
  }

  // Defence in depth: do not rely solely on the provider-side group restriction
  if (settings.requiredGroup) {
    const groups = Array.isArray(claims.groups) ? claims.groups : [];
    if (!groups.includes(settings.requiredGroup)) {
      throw new OidcLoginError('not_allowed', 'Not a member of the required group');
    }
  }

  return {
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    emailVerified: claims.email_verified === true,
    preferredUsername:
      typeof claims.preferred_username === 'string' ? claims.preferred_username : undefined,
  };
}

interface LinkableUser {
  id: string;
  username: string;
  email: string | null;
  role: string;
  isActive: boolean;
  isServiceAccount: boolean;
  oidcSubject: string | null;
  mustChangePassword: boolean;
}

function assertCanSignIn(user: LinkableUser): void {
  if (user.isServiceAccount) throw new OidcLoginError('not_allowed');
  if (!user.isActive) throw new OidcLoginError('deactivated');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/** Store `sub` on a user only if it is still unlinked (guards concurrent callbacks). */
async function storeSubject(userId: string, sub: string): Promise<void> {
  try {
    const { count } = await prisma.user.updateMany({
      where: { id: userId, oidcSubject: null },
      data: { oidcSubject: sub },
    });
    if (count !== 1) {
      throw new OidcLoginError('conflict', 'Account was linked concurrently');
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new OidcLoginError('conflict', 'Identity is already linked to another account');
    }
    throw error;
  }
}

/** Find, link or create the Notez user for a verified provider identity. */
export async function resolveOidcUser(identity: OidcIdentity): Promise<LinkableUser> {
  if (!identity.sub) throw new OidcLoginError('invalid_claims');

  // 1. Already linked
  const linked = await prisma.user.findUnique({ where: { oidcSubject: identity.sub } });
  if (linked) {
    assertCanSignIn(linked);
    return linked;
  }

  // Linking and creation both rely on the email, so it must be verified by the provider
  const email = identity.email?.trim().toLowerCase();
  if (!email || identity.emailVerified !== true) {
    throw new OidcLoginError('unverified_email');
  }

  // 2. Link an existing regular account by email, once
  const matches = await prisma.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    take: 2,
  });
  if (matches.length > 1) {
    // Two accounts differing only by email case: refuse to guess
    throw new OidcLoginError('conflict', 'Multiple accounts share this email');
  }
  if (matches.length === 1) {
    const existing = matches[0];
    assertCanSignIn(existing);
    if (existing.oidcSubject) {
      throw new OidcLoginError('conflict', 'Account is linked to a different identity');
    }
    if (existing.role !== 'user') {
      throw new OidcLoginError('link_required', 'Privileged accounts must link from Settings');
    }

    await storeSubject(existing.id, identity.sub);
    return { ...existing, oidcSubject: identity.sub };
  }

  // 3. Create a new regular user
  const username = await pickUsername(identity.preferredUsername, email);
  // Random unusable password: the account signs in through SSO, and can set a
  // real password later through the normal "forgot password" email flow.
  const passwordHash = await hashPassword(crypto.randomBytes(32).toString('hex'));

  try {
    return await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        role: 'user',
        isActive: true,
        mustChangePassword: false,
        oidcSubject: identity.sub,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new OidcLoginError('conflict', 'Account was created concurrently');
    }
    throw error;
  }
}

/**
 * Link a provider identity to a user who is already signed in to Notez. The signed-in
 * session proves account ownership, so no email match is needed. Works for any role,
 * and is the only way an admin account gets linked.
 */
export async function linkOidcToUser(
  userId: string,
  identity: OidcIdentity
): Promise<LinkableUser> {
  if (!identity.sub) throw new OidcLoginError('invalid_claims');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new OidcLoginError('not_allowed');
  assertCanSignIn(user);

  if (user.oidcSubject === identity.sub) return user;
  if (user.oidcSubject) {
    throw new OidcLoginError('conflict', 'Account is linked to a different identity');
  }

  const other = await prisma.user.findUnique({ where: { oidcSubject: identity.sub } });
  if (other) {
    throw new OidcLoginError('conflict', 'Identity is already linked to another account');
  }

  await storeSubject(user.id, identity.sub);
  return { ...user, oidcSubject: identity.sub };
}

/** Reduce a provider username to Notez's username rules (3-50 chars of [A-Za-z0-9_-]). */
export function sanitizeUsername(raw: string | undefined): string {
  const cleaned = (raw ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return cleaned.length >= 3 ? cleaned : `user${cleaned}`;
}

function isReserved(username: string): boolean {
  return (RESERVED_USERNAMES as readonly string[]).includes(username.toLowerCase());
}

async function pickUsername(preferred: string | undefined, email: string): Promise<string> {
  const base = sanitizeUsername(preferred || email.split('@')[0]);

  for (let i = 1; i <= 20; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (isReserved(candidate)) continue;
    const taken = await prisma.user.findFirst({
      where: { username: { equals: candidate, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Test hook: forget cached discovery so env changes take effect. */
export function resetOidcClientCache(): void {
  configPromise = null;
}
