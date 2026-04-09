import Fastify, { FastifyInstance } from 'fastify';
import { prismaPlugin } from './plugins/prisma';
import { healthRoute } from './routes/health';

export function buildApp(): FastifyInstance {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  const app = Fastify({ logger: false });
  app.register(prismaPlugin);
  app.register(healthRoute);
  return app;
}
