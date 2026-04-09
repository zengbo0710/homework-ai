import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { prisma, cleanDb, registerParent } from './helpers';

describe('Auth routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    await cleanDb();
  });

  afterEach(async () => { await app.close(); });
  afterAll(async () => { await prisma.$disconnect(); });

  describe('POST /api/auth/register', () => {
    it('returns 201 with tokens and grants 3 free tokens', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'new@example.com', name: 'New User', password: 'Password1!' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.user.email).toBe('new@example.com');
      const bal = await prisma.tokenBalance.findFirst({ where: { parent: { email: 'new@example.com' } } });
      expect(bal?.balance).toBe(3);
    });

    it('returns 409 for duplicate email', async () => {
      await registerParent(app, 'dup@example.com');
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'dup@example.com', name: 'Dup', password: 'Password1!' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('email_taken');
    });

    it('returns 400 when fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'bad@example.com' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => { await registerParent(app, 'login@example.com'); });

    it('returns 200 with tokens on correct credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'login@example.com', password: 'Password1!' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.user.email).toBe('login@example.com');
    });

    it('returns 401 on wrong password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'login@example.com', password: 'wrongpass' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for unknown email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'nobody@example.com', password: 'Password1!' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('returns new accessToken for valid refreshToken', async () => {
      const { refreshToken } = await registerParent(app, 'refresh@example.com');
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().accessToken).toBeDefined();
      expect(res.json().user.email).toBe('refresh@example.com');
    });

    it('returns 401 for unknown refreshToken', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: 'not-a-real-token' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('deletes refreshToken so subsequent refresh returns 401', async () => {
      const { refreshToken } = await registerParent(app, 'logout@example.com');
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        payload: { refreshToken },
      });
      expect(logoutRes.statusCode).toBe(204);

      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken },
      });
      expect(refreshRes.statusCode).toBe(401);
    });
  });
});
