import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/authenticate';
import { checkTokens } from '../middleware/checkTokens';

export async function tokenRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tokens/balance', { preHandler: [authenticate] }, async (request, reply) => {
    const balance = await app.prisma.tokenBalance.findUnique({
      where: { parentId: request.parentId },
    });
    return reply.send({ balance: balance?.balance ?? 0 });
  });

  app.get('/api/tokens/packages', { preHandler: [authenticate] }, async (_request, reply) => {
    const config = await app.prisma.systemConfig.findUnique({
      where: { key: 'token_packages' },
    });
    return reply.send(config?.value ?? []);
  });

  app.post('/api/tokens/purchase', { preHandler: [authenticate] }, async (_request, reply) => {
    return reply.status(501).send({ error: 'not_implemented', message: 'Stripe integration coming soon' });
  });

  // Test-only route to exercise checkTokens middleware
  app.get(
    '/api/tokens/test-check',
    {
      preHandler: [
        authenticate,
        (req, rep) => checkTokens(Number((req.query as { cost?: string }).cost ?? 1))(req, rep),
      ],
    },
    async (_request, reply) => {
      return reply.send({ ok: true });
    }
  );
}
