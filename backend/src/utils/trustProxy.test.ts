import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { resolveTrustProxy } from './trustProxy.js';

// On accserver the backend is reached three ways (checked live 2026-10-15):
//   - Cloudflare Tunnel: cloudflared -> host port 5173 -> docker-proxy, so the socket peer is the
//     apps-internal gateway 172.18.0.1 and Cloudflare has appended the client to X-Forwarded-For
//   - Traefik (notez.local.cogg.haus): socket peer is the Traefik container on apps-internal
//   - directly on the LAN (http://accserver:5173): socket peer is the LAN client itself
// Only the first two may set forwarded headers.
const TUNNEL = '172.18.0.1';
const TRAEFIK = '172.18.0.53';
const LAN_CLIENT = '192.168.66.49';

let app: FastifyInstance | undefined;

async function build(env: string | undefined): Promise<FastifyInstance> {
  app = Fastify({ trustProxy: resolveTrustProxy(env) });
  app.get('/whoami', async (request) => ({
    ip: request.ip,
    hostname: request.hostname,
    protocol: request.protocol,
  }));
  await app.ready();
  return app;
}

async function whoami(
  server: FastifyInstance,
  remoteAddress: string,
  headers: Record<string, string> = {}
): Promise<{ ip: string; hostname: string; protocol: string }> {
  const res = await server.inject({ method: 'GET', url: '/whoami', remoteAddress, headers });
  return res.json();
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('trustProxy default (TRUST_PROXY unset)', () => {
  it('a LAN client cannot pick its own rate-limit key with X-Forwarded-For', async () => {
    const server = await build(undefined);
    const seen = await whoami(server, LAN_CLIENT, { 'x-forwarded-for': '203.0.113.99' });
    expect(seen.ip).toBe(LAN_CLIENT);
  });

  it('a LAN client cannot claim another host or scheme with X-Forwarded-Host / -Proto', async () => {
    const server = await build(undefined);
    const seen = await whoami(server, LAN_CLIENT, {
      host: 'accserver.local.cogg.haus:5173',
      'x-forwarded-host': 'notez.cogg.haus',
      'x-forwarded-proto': 'https',
    });
    expect(seen.hostname).toBe('accserver.local.cogg.haus');
    expect(seen.protocol).toBe('http');
  });

  it('through the tunnel, request.ip is the client Cloudflare appended, not a spoofed leading entry', async () => {
    const server = await build(undefined);
    const seen = await whoami(server, TUNNEL, {
      host: 'notez.cogg.haus',
      'x-forwarded-for': '198.51.100.1, 203.0.113.7',
    });
    expect(seen.ip).toBe('203.0.113.7');
    expect(seen.hostname).toBe('notez.cogg.haus');
  });

  it('through Traefik, the forwarded client and LAN host name are used', async () => {
    const server = await build(undefined);
    const seen = await whoami(server, TRAEFIK, {
      host: 'notez-backend:3000',
      'x-forwarded-for': LAN_CLIENT,
      'x-forwarded-host': 'notez.local.cogg.haus',
      'x-forwarded-proto': 'https',
    });
    expect(seen.ip).toBe(LAN_CLIENT);
    expect(seen.hostname).toBe('notez.local.cogg.haus');
    expect(seen.protocol).toBe('https');
  });

  it('matches an IPv4-mapped IPv6 peer (a dual-stack listener) like the IPv4 one', async () => {
    const server = await build(undefined);
    const seen = await whoami(server, `::ffff:${TUNNEL}`, { 'x-forwarded-for': '203.0.113.7' });
    expect(seen.ip).toBe('203.0.113.7');
  });

  it('trusts a proxy on the same machine (loopback)', async () => {
    const server = await build(undefined);
    const seen = await whoami(server, '127.0.0.1', { 'x-forwarded-for': '203.0.113.7' });
    expect(seen.ip).toBe('203.0.113.7');
  });
});

describe('TRUST_PROXY set', () => {
  it('a list of addresses and ranges replaces the default', async () => {
    const server = await build(' 10.9.0.0/16 , 192.168.66.10 ');
    expect((await whoami(server, '10.9.3.4', { 'x-forwarded-for': '203.0.113.7' })).ip).toBe('203.0.113.7');
    expect((await whoami(server, '192.168.66.10', { 'x-forwarded-for': '203.0.113.7' })).ip).toBe('203.0.113.7');
    expect((await whoami(server, TUNNEL, { 'x-forwarded-for': '203.0.113.7' })).ip).toBe(TUNNEL);
  });

  it('"false" trusts no one', async () => {
    const server = await build('false');
    expect((await whoami(server, TUNNEL, { 'x-forwarded-for': '203.0.113.7' })).ip).toBe(TUNNEL);
  });

  it('"true" trusts every peer (explicit opt-in to the old behaviour)', async () => {
    const server = await build('true');
    expect((await whoami(server, LAN_CLIENT, { 'x-forwarded-for': '203.0.113.7' })).ip).toBe('203.0.113.7');
  });

  it.each(['notanip', '10.0.0.0/33', '172.18.0.1/', '3', 'fe80::/129', 'loopback,,'])(
    'refuses %j at startup instead of guessing',
    (value) => {
      expect(() => resolveTrustProxy(value)).toThrow(/TRUST_PROXY/);
    }
  );

  it('accepts the proxy-addr names and IPv6 ranges', () => {
    expect(resolveTrustProxy('loopback, linklocal, uniquelocal, fd00::/8, ::1')).toBe(
      'loopback,linklocal,uniquelocal,fd00::/8,::1'
    );
  });
});
