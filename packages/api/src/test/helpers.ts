import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';

export const prisma = new PrismaClient();

export async function cleanDb(): Promise<void> {
  await prisma.systemConfig.deleteMany({
    where: { key: { in: ['ai_model', 'ai_max_tokens', 'ai_temperature', 'ai_provider'] } },
  });
  await prisma.refreshToken.deleteMany();
  await prisma.practiceSessionSource.deleteMany();
  await prisma.practiceQuestion.deleteMany();
  await prisma.practiceSession.deleteMany();
  await prisma.wrongAnswer.deleteMany();
  await prisma.submissionImage.deleteMany();
  await prisma.aiResponse.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.child.deleteMany();
  await prisma.tokenTransaction.deleteMany();
  await prisma.tokenBalance.deleteMany();
  await prisma.parent.deleteMany();
}

export async function registerParent(
  app: FastifyInstance,
  email = 'test@example.com',
  name = 'Test Parent',
  password = 'Password1!'
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, name, password },
  });
  if (res.statusCode !== 201) {
    throw new Error(`registerParent failed: ${res.statusCode} ${res.body}`);
  }
  return res.json() as { accessToken: string; refreshToken: string; user: { id: string; email: string; name: string } };
}
