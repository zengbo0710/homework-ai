import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { prisma, cleanDb, registerParent } from './helpers';

describe('Token routes', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let parentId: string;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    await cleanDb();
    // Seed token_packages so GET /api/tokens/packages has data
    await prisma.systemConfig.upsert({
      where: { key: 'token_packages' },
      update: {},
      create: {
        key: 'token_packages',
        value: [
          { id: 'starter', tokens: 10, priceCents: 199, currency: 'USD' },
          { id: 'standard', tokens: 50, priceCents: 799, currency: 'USD' },
        ],
        description: 'Available token purchase packages',
      },
    });
    const auth = await registerParent(app);
    accessToken = auth.accessToken;
    parentId = auth.user.id;
  });

  afterEach(async () => { await app.close(); });
  afterAll(async () => { await prisma.$disconnect(); });

  function authHeader() {
    return { authorization: `Bearer ${accessToken}` };
  }

  describe('GET /api/tokens/balance', () => {
    it('returns account-wide token balance (3 after registration)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tokens/balance',
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().balance).toBe(3);
    });

    it('returns 401 without auth token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/tokens/balance' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/tokens/packages', () => {
    it('returns token packages from systemConfig', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tokens/packages',
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const packages = res.json();
      expect(Array.isArray(packages)).toBe(true);
      expect(packages.length).toBeGreaterThan(0);
      expect(packages[0]).toMatchObject({
        id: expect.any(String),
        tokens: expect.any(Number),
        priceCents: expect.any(Number),
      });
    });
  });

  describe('POST /api/tokens/purchase', () => {
    it('returns 501 Not Implemented', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tokens/purchase',
        headers: authHeader(),
        payload: { packageId: 'starter' },
      });
      expect(res.statusCode).toBe(501);
    });
  });

  describe('checkTokens middleware', () => {
    it('allows request when balance >= cost', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tokens/test-check?cost=1',
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 402 when balance < cost', async () => {
      await prisma.tokenBalance.update({
        where: { parentId },
        data: { balance: 0 },
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/tokens/test-check?cost=1',
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(402);
      expect(res.json().error).toBe('insufficient_tokens');
    });
  });
});
