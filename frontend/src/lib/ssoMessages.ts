// User-facing messages for the ?sso_error=<code> values the SSO callback redirects with.
// Shared by the login page and Settings > Profile so the same problem reads the same way.
// Written for non-technical users: say what happened and what to do next.

const ASK_FOR_HELP = 'Ask the person who manages your Notez account for help.';

export const SSO_ERROR_MESSAGES: Record<string, string> = {
  cancelled: 'Sign-in with Pocket ID was cancelled.',
  expired: 'That took too long and the sign-in expired. Please try again.',
  unverified_email: `Pocket ID doesn't have a confirmed email address for you. ${ASK_FOR_HELP}`,
  not_allowed: `This account can't use Pocket ID with Notez. Use your password instead. ${ASK_FOR_HELP}`,
  deactivated: 'This account has been deactivated. Please contact an administrator.',
  conflict: `We couldn't match this Pocket ID to your Notez account. ${ASK_FOR_HELP}`,
  link_required:
    'This account needs a one-time setup first. Sign in with your password, then go to Settings, Profile and choose Connect under "Sign in with Pocket ID".',
  invalid_claims: 'Pocket ID sent back an incomplete answer. Please try again.',
  not_configured: 'Signing in with Pocket ID is not available right now.',
  unavailable: 'Signing in with Pocket ID is not available right now. Please try again later.',
};

export const SSO_ERROR_FALLBACK = 'Signing in with Pocket ID did not work. Please try again.';
