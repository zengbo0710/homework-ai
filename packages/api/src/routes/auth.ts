import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  function signAccessToken(parentId: string): string {
    return jwt.sign({ sub: parentId }, process.env.JWT_SECRET!, { expiresIn: '15m' });
  }

  app.post('/api/auth/register', async (request, reply) => {
    const body = request.body as { email?: string; name?: string; password?: string };
    if (!body.email || !body.name || !body.password) {
      return reply.status(400).send({ error: 'missing_fields' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return reply.status(400).send({ error: 'invalid_email' });
    }
    const existing = await app.prisma.parent.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.status(409).send({ error: 'email_taken' });
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const parent = await app.prisma.parent.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
        tokenBalance: { create: { balance: 3, totalEarned: 3, totalSpent: 0 } },
      },
    });
    const accessToken = signAccessToken(parent.id);
    const refreshToken = uuidv4();
    await app.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        parentId: parent.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return reply.status(201).send({
      accessToken,
      refreshToken,
      user: { id: parent.id, email: parent.email, name: parent.name },
    });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return reply.status(400).send({ error: 'missing_fields' });
    }
    const parent = await app.prisma.parent.findUnique({ where: { email: body.email } });
    if (!parent) {
      return reply.status(401).send({ error: 'invalid_credentials' });
    }
    const valid = await bcrypt.compare(body.password, parent.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'invalid_credentials' });
    }
    const accessToken = signAccessToken(parent.id);
    const refreshToken = uuidv4();
    await app.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        parentId: parent.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return reply.status(200).send({
      accessToken,
      refreshToken,
      user: { id: parent.id, email: parent.email, name: parent.name },
    });
  });

  app.post('/api/auth/refresh', async (request, reply) => {
    const body = request.body as { refreshToken?: string };
    if (!body.refreshToken) {
      return reply.status(400).send({ error: 'missing_fields' });
    }
    const record = await app.prisma.refreshToken.findUnique({
      where: { token: body.refreshToken },
      include: { parent: true },
    });
    if (!record || record.expiresAt < new Date()) {
      if (record) await app.prisma.refreshToken.delete({ where: { token: body.refreshToken } });
      return reply.status(401).send({ error: 'invalid_refresh_token' });
    }
    const accessToken = signAccessToken(record.parent.id);
    return reply.status(200).send({
      accessToken,
      user: { id: record.parent.id, email: record.parent.email, name: record.parent.name },
    });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const body = request.body as { refreshToken?: string };
    if (body.refreshToken) {
      await app.prisma.refreshToken.deleteMany({ where: { token: body.refreshToken } });
    }
    return reply.status(204).send();
  });
}
