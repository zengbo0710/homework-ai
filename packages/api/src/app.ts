import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { prismaPlugin } from './plugins/prisma';
import { healthRoute } from './routes/health';
import { authRoutes } from './routes/auth';
import { childrenRoutes } from './routes/children';
import { tokenRoutes } from './routes/tokens';
import { uploadsDir } from './config';

export { uploadsDir };

export function buildApp(): FastifyInstance {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  const app = Fastify({ logger: false });

  // Ensure uploads dir exists
  fs.mkdirSync(uploadsDir, { recursive: true });

  app.register(multipart);
  app.register(staticFiles, {
    root: path.join(__dirname, '..', 'uploads'),
    prefix: '/uploads/',
  });

  app.register(prismaPlugin);
  app.register(healthRoute);
  app.register(authRoutes);
  app.register(childrenRoutes);
  app.register(tokenRoutes);
  return app;
}
