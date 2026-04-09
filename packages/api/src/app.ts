import Fastify, { FastifyInstance } from 'fastify';
import { prismaPlugin } from './plugins/prisma';
import { healthRoute } from './routes/health';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(prismaPlugin);
  app.register(healthRoute);
  return app;
}
