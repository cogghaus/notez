# Database Security Best Practices

## Problem: Credentials in DATABASE_URL

Storing database credentials in a single `DATABASE_URL` environment variable has security drawbacks:

```env
# ❌ LESS SECURE: Password visible in one place
DATABASE_URL=postgresql://notez:MySecretPass123@localhost:5432/notez
```

**Issues**:
- If `DATABASE_URL` is logged, both username AND password are exposed
- Password rotation requires changing the entire URL
- Harder to audit who has access to credentials

## Solution: Component-Based Configuration

Notez supports constructing `DATABASE_URL` from individual components:

```env
# ✅ MORE SECURE: Credentials separated
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=notez
POSTGRES_USER=notez
POSTGRES_PASSWORD=MySecretPass123
```

The application automatically constructs the DATABASE_URL at runtime from these components.

## How It Works

### Automatic Construction

When the backend starts (`backend/src/index.ts`):

1. Checks if `DATABASE_URL` is already set
2. If not, constructs it from `POSTGRES_*` variables
3. URL-encodes password to handle special characters
4. Logs safe version with redacted password

```typescript
// backend/src/lib/database-url.ts
export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;  // Use explicit URL if provided
  }

  // Construct from components
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  // ... build URL
}
```

### Safe Logging

Password is never logged in plaintext:

```typescript
// backend/src/lib/database-url.ts
export function getDatabaseUrlSafe(): string {
  const url = getDatabaseUrl();
  // postgresql://notez:********@localhost:5432/notez
  return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1********$3');
}
```

## Configuration Options

###  Option 1: Component-Based (Recommended)

**`.env` file:**
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=notez
POSTGRES_USER=notez
POSTGRES_PASSWORD=MySecretPassword123
```

**Benefits**:
- ✅ Password isolated from other config
- ✅ Easy rotation (change one variable)
- ✅ Better secrets management
- ✅ Safe to log connection info (without password)

### Option 2: Explicit DATABASE_URL (Legacy)

**`.env` file:**
```env
DATABASE_URL=postgresql://notez:MySecretPassword123@localhost:5432/notez?schema=public
```

**Use When**:
- Migrating from existing setup
- Using managed database service with pre-built URL
- Backward compatibility needed

## Migration Guide

### From Explicit URL to Components

1. **Extract components from your current DATABASE_URL:**
   ```
   DATABASE_URL=postgresql://USER:PASS@HOST:PORT/DB
                           ↓    ↓     ↓    ↓    ↓
   POSTGRES_USER=USER
   POSTGRES_PASSWORD=PASS
   POSTGRES_HOST=HOST
   POSTGRES_PORT=PORT
   POSTGRES_DB=DB
   ```

2. **Update `.env` file:**
   ```env
   # Remove or comment out DATABASE_URL
   # DATABASE_URL=postgresql://notez:changeme@localhost:5432/notez

   # Add components
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_DB=notez
   POSTGRES_USER=notez
   POSTGRES_PASSWORD=changeme
   ```

3. **Restart application** - it will construct DATABASE_URL automatically

4. **Verify** - check logs for:
   ```
   📊 Database URL configured from components: postgresql://notez:********@localhost:5432/notez
   ```

## Production Deployment

### Docker Compose

**compose.prod.yml:**
```yaml
services:
  backend:
    environment:
      # Option 1: Components (recommended)
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}

      # Option 2: Explicit URL (if needed)
      # DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
```

**`.env` file (not committed to git):**
```env
POSTGRES_DB=notez
POSTGRES_USER=notez
POSTGRES_PASSWORD=<strong-random-password-here>
```

### Kubernetes Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: notez-db-credentials
type: Opaque
stringData:
  postgres-user: notez
  postgres-password: <base64-encoded-password>
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notez-backend
spec:
  template:
    spec:
      containers:
      - name: backend
        env:
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: notez-db-credentials
              key: postgres-user
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: notez-db-credentials
              key: postgres-password
        - name: POSTGRES_HOST
          value: "postgres-service"
        - name: POSTGRES_PORT
          value: "5432"
        - name: POSTGRES_DB
          value: "notez"
```

## Password Rotation

### With Components (Easy):
```bash
# 1. Update password in your secret manager
# 2. Update POSTGRES_PASSWORD in .env
# 3. Restart application
docker compose -f compose.prod.yml restart notez-backend
```

### With Explicit URL (Harder):
```bash
# 1. Construct new DATABASE_URL with new password
# 2. Update DATABASE_URL in .env
# 3. Restart application
docker compose -f compose.prod.yml restart notez-backend
```

## Special Characters in Password

The component-based approach automatically URL-encodes passwords:

```env
# Password with special characters: P@ss!w0rd#2024
POSTGRES_PASSWORD=P@ss!w0rd#2024
```

Becomes:
```
postgresql://notez:P%40ss%21w0rd%232024@localhost:5432/notez
```

## Security Checklist

- [ ] Never commit `.env` files to git
- [ ] Use strong passwords (32+ random characters)
- [ ] Rotate passwords regularly
- [ ] Use secrets management (Vault, AWS Secrets Manager, etc.)
- [ ] Limit database user permissions (principle of least privilege)
- [ ] Use SSL/TLS for database connections in production
- [ ] Monitor database access logs
- [ ] Use component-based configuration for better security

## FAQ

**Q: Can I still use DATABASE_URL?**
A: Yes! If `DATABASE_URL` is set, it takes precedence. This ensures backward compatibility.

**Q: What happens if I set both DATABASE_URL and POSTGRES_* variables?**
A: `DATABASE_URL` takes precedence. The components are ignored.

**Q: How do I verify which method is being used?**
A: Check application startup logs:
- `📊 Database URL configured from components` = Using components
- No message = Using explicit `DATABASE_URL`

**Q: Does this work with Prisma migrations?**
A: Yes! Prisma reads `process.env.DATABASE_URL`, which is set before Prisma Client initializes.

## Related Files

- `backend/src/lib/database-url.ts` - URL construction logic
- `backend/src/index.ts` - Application startup (sets DATABASE_URL)
- `.env.example` - Configuration template
- `backend/prisma/schema.prisma` - Prisma configuration

## References

- [Prisma Connection URLs](https://www.prisma.io/docs/reference/database-reference/connection-urls)
- [The Twelve-Factor App: Config](https://12factor.net/config)
- [OWASP: Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
