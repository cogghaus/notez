import './telemetry.js';
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';
import { getDatabaseUrl, getDatabaseUrlSafe } from './lib/database-url.js';
import { authRoutes } from './routes/auth.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { notesRoutes } from './routes/notes.routes.js';
import { foldersRoutes } from './routes/folders.routes.js';
import { tagRoutes } from './routes/tags.routes.js';
import { tasksRoutes } from './routes/tasks.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { searchRoutes } from './routes/search.routes.js';
import { imagesRoutes } from './routes/images.routes.js';
import { profileRoutes, profilePublicRoutes } from './routes/profile.routes.js';
import { referencesRoutes } from './routes/references.routes.js';
import { feedbackRoutes, adminFeedbackRoutes } from './routes/feedback.routes.js';
import { notificationsRoutes } from './routes/notifications.routes.js';
import { sharesRoutes } from './routes/shares.routes.js';
import { collaborationRoutes } from './routes/collaboration.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { tokenRoutes } from './routes/token.routes.js';
import { mcpRoutes } from './routes/mcp.routes.js';
import { webhooksRoutes } from './routes/webhooks.routes.js';
import { oauthRoutes } from './mcp/oauth.routes.js';
import { mcpTransportRoutes } from './mcp/transport.routes.js';
import { prisma, disconnectPrisma } from './lib/db.js';
import { storageService } from './services/storage.service.js';
import { hocuspocusServer } from './services/collaboration.service.js';
import { startWebhookWorker, stopWebhookWorker } from './services/webhook-worker.service.js';

// Configure DATABASE_URL from components if not explicitly set
// This allows using POSTGRES_USER, POSTGRES_PASSWORD, etc. instead of hardcoded URL
if (!process.env.DATABASE_URL) {
  try {
    process.env.DATABASE_URL = getDatabaseUrl();
    console.log(`📊 Database URL configured from components: ${getDatabaseUrlSafe()}`);
  } catch (error) {
    console.error('❌ Failed to configure database URL:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Production environment validation - fail fast if critical config is missing
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  if (!process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN must be set in production environment');
  }
}

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
  trustProxy: true, // Required for Cloudflare Tunnel, nginx, etc.
});

// Register plugins
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
});

// Register cookie plugin with secret for signing
const cookieSecret = process.env.COOKIE_SECRET || process.env.JWT_REFRESH_SECRET;
if (!cookieSecret) {
  throw new Error('COOKIE_SECRET or JWT_REFRESH_SECRET environment variable is required');
}
await fastify.register(cookie, {
  secret: cookieSecret,
});

const jwtSecret = process.env.JWT_ACCESS_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_ACCESS_SECRET environment variable is required');
}
await fastify.register(jwt, {
  secret: jwtSecret,
  cookie: {
    cookieName: 'refreshToken',
    signed: true,
  },
});

// Register WebSocket plugin for real-time collaboration
await fastify.register(websocket);

// Register multipart plugin for file uploads
await fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 1, // Only allow 1 file per request
  },
});

// Register rate limiting plugin for brute force protection
// Global defaults - specific routes will have stricter limits
await fastify.register(rateLimit, {
  max: 300, // 300 requests per minute for general endpoints (auto-save, polling, shares add up fast)
  timeWindow: '1 minute',
  // Skip rate limiting in development for easier testing
  // In production, this should always be enabled
  skipOnError: process.env.NODE_ENV !== 'production',
  // Use real client IP when behind proxy (trustProxy is enabled above)
  keyGenerator: (request) => {
    return request.ip;
  },
  // Custom error message.
  // @fastify/rate-limit throws whatever this returns, verbatim, so the object
  // must carry statusCode itself — the default builder sets it on an Error.
  // Without it the global error handler cannot distinguish throttling from an
  // unexpected failure and turns every rate-limited request into a 500.
  errorResponseBuilder: (_request, context) => {
    return {
      statusCode: context.statusCode,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    };
  },
});

// Global security headers
fastify.addHook('onSend', async (_request, reply, payload) => {
  // Prevent clickjacking
  reply.header('X-Frame-Options', 'DENY');
  // Prevent MIME type sniffing
  reply.header('X-Content-Type-Options', 'nosniff');
  // Control referrer information
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Remove powered-by header
  reply.removeHeader('X-Powered-By');
  return payload;
});

// Global error handler — catches any unhandled errors so users never see raw 500s or stack traces.
// Route-level try/catch blocks should still handle expected errors with specific status codes;
// this is the safety net for anything that slips through.
fastify.setErrorHandler((error: FastifyError, request, reply) => {
  // Zod validation errors (thrown by validate middleware or uncaught .parse() calls)
  if (error.name === 'ZodError') {
    return reply.code(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
    });
  }

  // Fastify validation errors (schema-based)
  if (error.validation) {
    return reply.code(400).send({
      error: 'Validation Error',
      message: error.message,
    });
  }

  // Rate limit errors (statusCode comes from the rate-limit errorResponseBuilder).
  // retryAfter is forwarded so clients can back off instead of guessing.
  if (error.statusCode === 429) {
    const { retryAfter } = error as unknown as { retryAfter?: number };
    return reply.code(429).send({
      error: 'Too Many Requests',
      message: error.message,
      ...(retryAfter !== undefined ? { retryAfter } : {}),
    });
  }

  // Any error with an explicit status code (e.g. 401, 403, 404)
  if (error.statusCode && error.statusCode < 500) {
    return reply.code(error.statusCode).send({
      error: error.name || 'Error',
      message: error.message,
    });
  }

  // Unexpected errors — log full details server-side, return safe message to client
  request.log.error(error);
  return reply.code(500).send({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred. Please try again.',
  });
});

// Health check endpoint.
// Must return a non-2xx code when the database is unreachable: the Docker
// HEALTHCHECK (and any upstream probe) only inspects the status code, so
// returning 200 with an "error" body would report the container as healthy
// through a full database outage and suppress the restart.
fastify.get('/health', async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'connected' };
  } catch (error) {
    return reply.code(503).send({ status: 'error', database: 'disconnected' });
  }
});

// Register API routes
await fastify.register(authRoutes, { prefix: '/api' });
await fastify.register(usersRoutes, { prefix: '/api' });
await fastify.register(sharesRoutes, { prefix: '/api' }); // Note sharing (before notes to avoid route conflicts)
await fastify.register(notesRoutes, { prefix: '/api' });
await fastify.register(foldersRoutes, { prefix: '/api' });
await fastify.register(tagRoutes, { prefix: '/api/tags' });
await fastify.register(tasksRoutes, { prefix: '/api' });
await fastify.register(aiRoutes, { prefix: '/api/ai' });
await fastify.register(searchRoutes, { prefix: '/api/search' });
await fastify.register(imagesRoutes, { prefix: '/api' });
await fastify.register(profilePublicRoutes, { prefix: '/api' }); // Public routes (no auth)
await fastify.register(profileRoutes, { prefix: '/api' }); // Protected routes (auth required)
await fastify.register(referencesRoutes, { prefix: '/api' }); // Wiki-link references routes
await fastify.register(feedbackRoutes, { prefix: '/api' }); // User feedback submission
await fastify.register(adminFeedbackRoutes, { prefix: '/api' }); // Admin feedback management
await fastify.register(notificationsRoutes, { prefix: '/api' }); // User notifications
await fastify.register(collaborationRoutes, { prefix: '/api' }); // Real-time collaboration WebSocket
await fastify.register(adminRoutes, { prefix: '/api' }); // Admin service account endpoints
await fastify.register(tokenRoutes, { prefix: '/api' }); // API token management
await fastify.register(webhooksRoutes, { prefix: '/api' }); // Webhook subscriptions & delivery log
await fastify.register(mcpRoutes, { prefix: '/api/mcp' }); // MCP API endpoints (legacy — kept for backwards compatibility)
await fastify.register(mcpRoutes, { prefix: '/api/v1' });  // Versioned external API

// Remote MCP connector (OAuth 2.1 + Streamable HTTP transport)
// Feature-gated: only registers routes when MCP_REMOTE_ENABLED=true
if (process.env.MCP_REMOTE_ENABLED === 'true') {
  if (!process.env.APP_URL) {
    throw new Error('APP_URL must be set when MCP_REMOTE_ENABLED=true (required for OAuth metadata)');
  }
  await fastify.register(oauthRoutes);  // /.well-known/* + /mcp/oauth/* (mounted at root for well-known paths)
  await fastify.register(mcpTransportRoutes);  // POST/GET/DELETE /mcp (Streamable HTTP transport)
  console.log('🔌 Remote MCP connector enabled');
}

// Serve frontend static files (in production)
// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In production, serve the built frontend from /app/frontend/dist
// In development, this path won't exist and that's okay - frontend runs separately
const frontendDistPath = join(__dirname, '../../frontend/dist');

await fastify.register(fastifyStatic, {
  root: frontendDistPath,
  prefix: '/', // Serve from root
});

// Fallback route for SPA - send index.html for all non-API routes
fastify.setNotFoundHandler(async (request, reply) => {
  // Don't handle API routes, health check, or MCP endpoints
  if (request.url.startsWith('/api') || request.url.startsWith('/health') || request.url.startsWith('/mcp')) {
    reply.code(404).send({ error: 'Not found' });
    return;
  }

  // For all other routes, serve index.html (SPA fallback)
  return reply.sendFile('index.html');
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    // Initialize MinIO storage (creates bucket if needed)
    try {
      await storageService.initialize();
    } catch (error) {
      console.warn('⚠️ MinIO storage not available - image uploads will fail');
      console.warn('   Make sure MinIO is running and configured properly');
    }

    await fastify.listen({ port, host });
    console.log(`🚀 Notez API server running on http://${host}:${port}`);

    // Start webhook delivery worker
    startWebhookWorker();
  } catch (err) {
    fastify.log.error(err);
    await disconnectPrisma();
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received, closing server gracefully...`);
  try {
    stopWebhookWorker();
    // Explicitly drain MCP sessions before closing Fastify (don't rely solely on onClose hook)
    if (process.env.MCP_REMOTE_ENABLED === 'true') {
      try {
        const { sessionManager } = await import('./mcp/transport.routes.js');
        sessionManager.stop();
        await sessionManager.closeAll();
      } catch { /* MCP not loaded */ }
    }
    await hocuspocusServer.closeConnections();
    await fastify.close();
    await disconnectPrisma();
    console.log('Server closed gracefully.');
    process.exit(0);
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start();
