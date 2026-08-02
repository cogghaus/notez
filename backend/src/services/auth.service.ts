import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../lib/db.js';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt.utils.js';
import { emailService } from './email.service.js';
import type { SetupInput, LoginInput, ChangePasswordInput } from '../utils/validation.schemas.js';

const SALT_ROUNDS = 10;

/**
 * Hash a refresh token for storage. Sessions persist only this digest, so a
 * database read cannot be replayed against /api/auth/refresh. Kept consistent
 * with token.service.hashToken and the OAuth token hashing.
 *
 * SHA-256 rather than bcrypt is deliberate: refresh tokens are 256-bit random
 * JWTs, not low-entropy secrets, so there is nothing to brute force, and the
 * lookup has to be an indexed equality match on every refresh.
 */
function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Check if this is the first user (for initial setup)
 */
export async function isFirstUser(): Promise<boolean> {
  const userCount = await prisma.user.count();
  return userCount === 0;
}

/**
 * Create the first admin user (initial setup)
 */
export async function setupFirstUser(data: SetupInput) {
  // Verify this is the first user
  const isFirst = await isFirstUser();
  if (!isFirst) {
    throw new Error('Setup has already been completed');
  }

  // Check if username or email already exists (shouldn't happen, but defensive)
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username: data.username }, { email: data.email }],
    },
  });

  if (existing) {
    throw new Error('Username or email already exists');
  }

  // Hash password
  const passwordHash = await hashPassword(data.password);

  // Create admin user
  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      passwordHash,
      role: 'admin',
      isActive: true,
      mustChangePassword: false,
    },
  });

  // Generate tokens
  const tokens = generateTokenPair({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  // Store refresh token in database
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashRefreshToken(tokens.refreshToken),
      expiresAt,
    },
  });

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    tokens,
  };
}

/**
 * Login with username or email (case-insensitive for email)
 */
export async function login(data: LoginInput) {
  // Normalize the input for case-insensitive comparison
  const normalizedInput = data.usernameOrEmail.toLowerCase();

  // Find user by username (case-sensitive) or email (case-insensitive)
  // PostgreSQL's ILIKE is case-insensitive, but we use raw query for email
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: data.usernameOrEmail }, // Username is case-sensitive
        { email: { equals: normalizedInput, mode: 'insensitive' } }, // Email is case-insensitive
      ],
    },
  });

  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Service accounts cannot log in via password — use API tokens instead
  if (user.isServiceAccount) {
    throw new Error('Invalid credentials');
  }

  // Check if user is active
  if (!user.isActive) {
    throw new Error('Account is deactivated');
  }

  // Verify password
  const isValidPassword = await verifyPassword(data.password, user.passwordHash);
  if (!isValidPassword) {
    throw new Error('Invalid credentials');
  }

  // Generate tokens
  const tokens = generateTokenPair({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  // Store refresh token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashRefreshToken(tokens.refreshToken),
      expiresAt,
    },
  });

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    tokens,
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string) {
  // Verify refresh token
  try {
    verifyRefreshToken(refreshToken);
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }

  // Check if refresh token exists in database (looked up by digest)
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: hashRefreshToken(refreshToken) },
    include: { user: true },
  });

  if (!session) {
    throw new Error('Invalid refresh token');
  }

  // Check if session is expired
  if (session.expiresAt < new Date()) {
    // Delete expired session (use deleteMany to avoid race condition errors)
    await prisma.session.deleteMany({ where: { id: session.id } });
    throw new Error('Refresh token expired');
  }

  // Check if user is still active
  if (!session.user.isActive) {
    throw new Error('Account is deactivated');
  }

  // Generate new token pair
  const tokens = generateTokenPair({
    userId: session.user.id,
    username: session.user.username,
    role: session.user.role,
  });

  // Delete old session and create new one atomically (prevents token reuse)
  // Use deleteMany instead of delete to handle race conditions where
  // multiple tabs/requests try to refresh the same token simultaneously
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + 7);

  await prisma.$transaction([
    prisma.session.deleteMany({
      where: { id: session.id },
    }),
    prisma.session.create({
      data: {
        userId: session.user.id,
        refreshTokenHash: hashRefreshToken(tokens.refreshToken),
        expiresAt: newExpiresAt,
      },
    }),
  ]);

  return {
    user: {
      id: session.user.id,
      username: session.user.username,
      email: session.user.email,
      role: session.user.role,
      mustChangePassword: session.user.mustChangePassword,
    },
    tokens,
  };
}

/**
 * Logout (invalidate all user sessions for security)
 */
export async function logout(refreshToken: string) {
  // Find the session to get the userId (looked up by digest)
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: hashRefreshToken(refreshToken) },
    select: { userId: true },
  });

  if (!session) {
    // Session doesn't exist, nothing to do
    return;
  }

  // Invalidate ALL sessions for this user for better security
  await prisma.session.deleteMany({
    where: { userId: session.userId },
  });
}

/**
 * Change user's own password
 */
export async function changePassword(userId: string, data: ChangePasswordInput) {
  // Get user
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Service accounts cannot change passwords — they use API tokens
  if (user.isServiceAccount) {
    throw new Error('Service accounts do not use passwords');
  }

  // Verify current password
  const isValidPassword = await verifyPassword(data.currentPassword, user.passwordHash);
  if (!isValidPassword) {
    throw new Error('Current password is incorrect');
  }

  // Hash new password
  const newPasswordHash = await hashPassword(data.newPassword);

  // Update password and clear mustChangePassword flag
  // Also invalidate all sessions for security (in case current password was compromised)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
      },
    }),
    // Invalidate all existing sessions - user will need to log in again
    prisma.session.deleteMany({
      where: { userId },
    }),
  ]);
}

/**
 * Clean up expired sessions (should be run periodically)
 */
export async function cleanupExpiredSessions() {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}

/**
 * Hash a token using SHA-256 for secure storage
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Request password reset - generates token and sends email
 */
export async function requestPasswordReset(email: string): Promise<void> {
  // Find user by email (case-insensitive)
  const user = await prisma.user.findFirst({
    where: {
      email: { equals: email.toLowerCase(), mode: 'insensitive' },
    },
  });

  // If user not found, silently return to prevent email enumeration
  if (!user) {
    // Log without revealing email address
    console.log('Password reset requested for non-existent account');
    return;
  }

  // Check if user is active
  if (!user.isActive) {
    console.log('Password reset requested for inactive account');
    return;
  }

  // Invalidate any existing reset tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: {
      userId: user.id,
      usedAt: null,
    },
    data: {
      usedAt: new Date(), // Mark as used to invalidate
    },
  });

  // Generate secure random token - this is sent to the user
  const rawToken = crypto.randomBytes(32).toString('hex');

  // Hash the token for storage - only the hash is stored in DB
  const hashedToken = hashToken(rawToken);

  // Token expires in 1 hour
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);

  // Store hashed token in database
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token: hashedToken,
      expiresAt,
    },
  });

  // Send email with raw token (user needs raw token to reset)
  // Null guard: user was found by email so email should be non-null, but
  // the column is now nullable for service accounts.
  if (user.email) {
    const emailSent = await emailService.sendPasswordResetEmail(
      user.email,
      user.username,
      rawToken
    );

    if (!emailSent) {
      // Log without revealing email address
      console.warn('Failed to send password reset email');
      // We don't throw an error to prevent revealing if email exists
    }
  }
}

/**
 * Validate a password reset token
 */
export async function validateResetToken(token: string): Promise<boolean> {
  // Hash the incoming token to compare with stored hash
  const hashedToken = hashToken(token);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token: hashedToken },
  });

  if (!resetToken) {
    return false;
  }

  // Check if token has been used
  if (resetToken.usedAt) {
    return false;
  }

  // Check if token has expired
  if (resetToken.expiresAt < new Date()) {
    return false;
  }

  return true;
}

/**
 * Reset password using token
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  // Hash the incoming token to compare with stored hash
  const hashedToken = hashToken(token);

  // Hash new password before transaction
  const passwordHash = await hashPassword(newPassword);

  // Use interactive transaction to prevent race conditions
  const result = await prisma.$transaction(async (tx) => {
    // Find the token inside transaction for atomicity
    const resetToken = await tx.passwordResetToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    // Combine all token validation checks to prevent timing attacks
    // All invalid states return the same generic error message
    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt < new Date() ||
      !resetToken.user.isActive
    ) {
      throw new Error('Invalid or expired reset token');
    }

    // Update password
    await tx.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    // Mark token as used
    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: {
        usedAt: new Date(),
      },
    });

    // Invalidate all existing sessions for security
    await tx.session.deleteMany({
      where: { userId: resetToken.userId },
    });

    return { email: resetToken.user.email, username: resetToken.user.username };
  });

  // Send confirmation email (outside transaction)
  if (result.email) {
    await emailService.sendPasswordChangedEmail(result.email, result.username);
  }
}

/**
 * Clean up expired password reset tokens (should be run periodically)
 */
export async function cleanupExpiredResetTokens() {
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { usedAt: { not: null } },
      ],
    },
  });

  return result.count;
}
