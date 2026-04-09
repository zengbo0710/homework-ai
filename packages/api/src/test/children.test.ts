import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { prisma, cleanDb, registerParent } from './helpers';

describe('Children routes', () => {
  let app: FastifyInstance;
  let accessToken: string;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    await cleanDb();
    const auth = await registerParent(app);
    accessToken = auth.accessToken;
  });

  afterEach(async () => { await app.close(); });
  afterAll(async () => { await prisma.$disconnect(); });

  function authHeader() {
    return { authorization: `Bearer ${accessToken}` };
  }

  describe('POST /api/children', () => {
    it('creates a child and returns it with gradeLevel string', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/children',
        headers: authHeader(),
        payload: { name: 'Alice', gradeLevel: 'P3' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.name).toBe('Alice');
      expect(body.gradeLevel).toBe('P3');
      expect(body.id).toBeDefined();
    });

    it('returns 422 when parent already has 5 children', async () => {
      for (let i = 1; i <= 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/children',
          headers: authHeader(),
          payload: { name: `Child ${i}`, gradeLevel: 'P1' },
        });
      }
      const res = await app.inject({
        method: 'POST',
        url: '/api/children',
        headers: authHeader(),
        payload: { name: 'Extra', gradeLevel: 'P1' },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('max_children_reached');
    });

    it('returns 401 without auth token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/children',
        payload: { name: 'Alice', gradeLevel: 'P1' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/children', () => {
    it('returns children for authenticated parent only', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/children',
        headers: authHeader(),
        payload: { name: 'Alice', gradeLevel: 'P3' },
      });

      // Second parent should not see first parent's children
      const auth2 = await registerParent(app, 'other@example.com');
      const res = await app.inject({
        method: 'GET',
        url: '/api/children',
        headers: { authorization: `Bearer ${auth2.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(0);

      // First parent sees their child
      const res2 = await app.inject({
        method: 'GET',
        url: '/api/children',
        headers: authHeader(),
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json()).toHaveLength(1);
      expect(res2.json()[0].name).toBe('Alice');
    });
  });

  describe('PUT /api/children/:id', () => {
    it('updates name and gradeLevel', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/children',
        headers: authHeader(),
        payload: { name: 'Alice', gradeLevel: 'P1' },
      });
      const { id } = create.json();

      const res = await app.inject({
        method: 'PUT',
        url: `/api/children/${id}`,
        headers: authHeader(),
        payload: { name: 'Alicia', gradeLevel: 'P2' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('Alicia');
      expect(res.json().gradeLevel).toBe('P2');
    });

    it('returns 403 when updating another parent\'s child', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/children',
        headers: authHeader(),
        payload: { name: 'Alice', gradeLevel: 'P1' },
      });
      const { id } = create.json();

      const auth2 = await registerParent(app, 'other@example.com');
      const res = await app.inject({
        method: 'PUT',
        url: `/api/children/${id}`,
        headers: { authorization: `Bearer ${auth2.accessToken}` },
        payload: { name: 'Hacker', gradeLevel: 'P1' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/children/:id', () => {
    it('deletes child and returns 204', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/children',
        headers: authHeader(),
        payload: { name: 'Alice', gradeLevel: 'P1' },
      });
      const { id } = create.json();

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/children/${id}`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(204);

      const list = await app.inject({ method: 'GET', url: '/api/children', headers: authHeader() });
      expect(list.json()).toHaveLength(0);
    });

    it('returns 403 when deleting another parent\'s child', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/children',
        headers: authHeader(),
        payload: { name: 'Alice', gradeLevel: 'P1' },
      });
      const { id } = create.json();

      const auth2 = await registerParent(app, 'other@example.com');
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/children/${id}`,
        headers: { authorization: `Bearer ${auth2.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/children/:id/avatar', () => {
    it('uploads avatar, resizes to JPEG, and returns avatarUrl', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/children',
        headers: authHeader(),
        payload: { name: 'Alice', gradeLevel: 'P1' },
      });
      const { id } = create.json();

      // Minimal valid 1x1 white JPEG (base64) — generated with sharp
      const jpegBytes = Buffer.from(
        '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYW' +
        'ICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgo' +
        'KCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIA' +
        'AhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QA' +
        'FAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/' +
        'AKpAB//Z',
        'base64'
      );

      // Use multipart form — send as raw buffer with multipart content type
      const boundary = '----TestBoundary';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
        jpegBytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/children/${id}/avatar`,
        headers: {
          ...authHeader(),
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().avatarUrl).toMatch(/^\/uploads\/avatars\/.+\.jpg$/);
    });
  });
});
