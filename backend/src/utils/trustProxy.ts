/**
 * Which peers may set X-Forwarded-For / -Host / -Proto (Fastify's `trustProxy`).
 *
 * Extracted from index.ts unchanged: every peer is trusted.
 */
export type TrustProxySetting = boolean | string;

export function resolveTrustProxy(_value: string | undefined): TrustProxySetting {
  return true;
}
