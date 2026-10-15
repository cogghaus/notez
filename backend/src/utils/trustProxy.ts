import { isIP } from 'node:net';

/**
 * Which socket peers may set X-Forwarded-For / -Host / -Proto (Fastify's `trustProxy`).
 *
 * request.ip keys every rate limit and request.hostname decides the SSO host bounce, so only the
 * proxies in front of the backend may rewrite them. `true` (the old setting) let anyone who can
 * reach the port directly, such as a LAN client on :5173, pick their own rate-limit bucket.
 *
 * TRUST_PROXY:
 * - unset or empty: DEFAULT_TRUSTED_PROXIES
 * - a comma-separated list of IP addresses, CIDR ranges, and the proxy-addr names
 *   loopback / linklocal / uniquelocal
 * - "false": trust no one (the backend is reached directly)
 * - "true": trust every peer (only when nothing but the proxy can reach the backend)
 * Anything else stops startup rather than guessing.
 */
export type TrustProxySetting = boolean | string;

/**
 * The machine itself plus the range of Docker's first default address pools (172.17-172.31). A
 * reverse proxy or tunnel in a container on the same Docker host reaches the backend from there
 * (on accserver: the tunnel through docker-proxy as the apps-internal gateway, Traefik from its
 * apps-internal address), while LAN clients keep their own address. Every container on that
 * Docker host is trusted with it. Not uniquelocal: that would trust 10/8 and 192.168/16, the LAN.
 * Docker networks outside 172.16/12, rootless Docker, or `iptables: false` (LAN clients then
 * arrive from the gateway) need an explicit TRUST_PROXY.
 */
export const DEFAULT_TRUSTED_PROXIES = 'loopback,172.16.0.0/12';

const NAMED_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isValidEntry(entry: string): boolean {
  if (NAMED_RANGES.has(entry)) return true;
  const slash = entry.indexOf('/');
  if (slash === -1) return isIP(entry) !== 0;
  const family = isIP(entry.slice(0, slash));
  const prefix = entry.slice(slash + 1);
  if (family === 0 || !/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 4 ? 32 : 128);
}

export function resolveTrustProxy(value: string | undefined): TrustProxySetting {
  const raw = value?.trim() ?? '';
  if (raw === '') return DEFAULT_TRUSTED_PROXIES;
  if (raw === 'false') return false;
  if (raw === 'true') return true;

  const entries = raw.split(',').map((entry) => entry.trim());
  for (const entry of entries) {
    if (!isValidEntry(entry)) {
      throw new Error(
        `TRUST_PROXY: "${entry}" is not an IP address, a CIDR range, or one of loopback, linklocal, uniquelocal (or set it to true or false)`
      );
    }
  }
  return entries.join(',');
}
