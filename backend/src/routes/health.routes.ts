import type { FastifyInstance } from 'fastify';
import { APP_VERSION } from '../lib/version.js';

export interface HealthRoutesOptions {
  /** Resolves when the database answers; rejects when it does not */
  checkDatabase: () => Promise<unknown>;
}

/**
 * Health check endpoint.
 * Must return a non-2xx code when the database is unreachable: the Docker
 * HEALTHCHECK (and any upstream probe) only inspects the status code, so
 * returning 200 with an "error" body would report the container as healthy
 * through a full database outage and suppress the restart.
 *
 * `version` lets API clients gate features on the deployed schema
 * (Foyer writes tasks only from 1.31.0, when source/externalId exist).
 */
export async function healthRoutes(fastify: FastifyInstance, opts: HealthRoutesOptions) {
  fastify.get('/health', async (_request, reply) => {
    try {
      await opts.checkDatabase();
      return { status: 'ok', database: 'connected', version: APP_VERSION };
    } catch {
      return reply.code(503).send({ status: 'error', database: 'disconnected', version: APP_VERSION });
    }
  });
}
