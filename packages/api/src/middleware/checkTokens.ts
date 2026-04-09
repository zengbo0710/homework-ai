import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

export function checkTokens(cost: number) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const app = request.server as FastifyInstance & { prisma: PrismaClient };
    const balance = await app.prisma.tokenBalance.findUnique({
      where: { parentId: request.parentId },
    });
    if (!balance || balance.balance < cost) {
      return reply.status(402).send({ error: 'insufficient_tokens' });
    }
  };
}
