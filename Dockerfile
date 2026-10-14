# Multi-stage Dockerfile for Notez
# Builds frontend and backend into a single optimized image

# Stage 1: Build Frontend
FROM node:24-alpine AS frontend-builder

# Accept version as build argument, which can override the package.json version
ARG APP_VERSION

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Set version environment variable for Vite.
# If APP_VERSION is not provided via build-arg, read from package.json
RUN if [ -z "$APP_VERSION" ]; then \
      echo "VITE_APP_VERSION=$(node -p "require('./package.json').version")" >> .env.production; \
    else \
      echo "VITE_APP_VERSION=$APP_VERSION" >> .env.production; \
    fi

# Build frontend for production (Vite reads from .env.production)
# Skip if dist/ already exists (pre-built in CI)
RUN if [ -d "dist" ] && [ "$(ls -A dist)" ]; then \
      echo "Using pre-built frontend artifacts"; \
    else \
      npm run build; \
    fi

# Stage 2: Build Backend
FROM node:24-alpine AS backend-builder

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy backend source
COPY backend/ ./

# Generate Prisma Client
RUN npx prisma generate

# Build backend TypeScript (uses esbuild for fast, low-memory transpilation)
# If dist/ already exists (pre-built in CI), skip build. Otherwise build in-container.
RUN if [ -d "dist" ] && [ "$(ls -A dist)" ]; then \
      echo "Using pre-built artifacts"; \
    else \
      npm run build; \
    fi

# Note: NOT pruning devDependencies because we need prisma CLI for migrations
# The prisma package is required for running "npx prisma migrate deploy" in production

# Stage 3: Production Image
FROM node:24-alpine

# Install runtime dependencies (dumb-init for signal handling, openssl for Prisma)
RUN apk add --no-cache dumb-init openssl

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S notez && \
    adduser -S notez -u 1001

# Copy backend build and dependencies
COPY --from=backend-builder --chown=notez:notez /app/backend/dist ./backend/dist
COPY --from=backend-builder --chown=notez:notez /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder --chown=notez:notez /app/backend/package.json ./backend/package.json

# Copy Prisma schema and migrations
COPY --from=backend-builder --chown=notez:notez /app/backend/prisma ./backend/prisma

# Copy frontend build
COPY --from=frontend-builder --chown=notez:notez /app/frontend/dist ./frontend/dist

# Copy entrypoint script
COPY --chown=notez:notez docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Switch to non-root user
USER notez

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use entrypoint script to run migrations before starting app
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start the application
CMD ["node", "backend/dist/index.js"]
