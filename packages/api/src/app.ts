import Fastify, { FastifyInstance } from 'fastify';
import { healthRoute } from './routes/health';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(healthRoute);
  return app;
}
