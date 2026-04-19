import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { prisma, cleanDb, registerParent } from './helpers';

async function seedWrongAnswer(childId: string, submissionId: string, overrides = {}) {
  return prisma.wrongAnswer.create({
    data: {
      submissionId,
      childId,
      subject: 'math',
      questionNumber: 1,
      imageOrder: 1,
      questionText: 'What is 5×3?',
      childAnswer: '14',
      correctAnswer: '15',
      status: 'wrong',
      explanation: 'Multiplication error',
      topic: 'multiplication',
      ...overrides,
    },
  });
}

describe('Wrong-answer routes', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let childId: string;
  let submissionId: string;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    await cleanDb();

    const auth = await registerParent(app);
    accessToken = auth.accessToken;

    const childRes = await app.inject({
      method: 'POST', url: '/api/children',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Alice', gradeLevel: 'P3' },
    });
    childId = childRes.json().id;

    const submission = await prisma.submission.create({
      data: { childId, imageCount: 1, status: 'completed' },
    });
    submissionId = submission.id;
  });

  afterEach(async () => { await app.close(); });
  afterAll(async () => { await prisma.$disconnect(); });

  function auth() { return { authorization: `Bearer ${accessToken}` }; }

  describe('GET /api/wrong-answers/summary', () => {
    it('returns per-subject unresolved counts', async () => {
      await seedWrongAnswer(childId, submissionId, { subject: 'math' });
      await seedWrongAnswer(childId, submissionId, { subject: 'math', questionNumber: 2 });
      await seedWrongAnswer(childId, submissionId, { subject: 'english', questionNumber: 3 });

      const res = await app.inject({
        method: 'GET', url: `/api/wrong-answers/summary?childId=${childId}`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.math).toBe(2);
      expect(body.english).toBe(1);
      expect(body.science).toBe(0);
    });
  });

  describe('GET /api/wrong-answers', () => {
    it('returns unresolved answers for a subject', async () => {
      await seedWrongAnswer(childId, submissionId);
      const res = await app.inject({
        method: 'GET', url: `/api/wrong-answers?childId=${childId}&subject=math&resolved=false`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].questionText).toBe('What is 5×3?');
    });
  });

  describe('PATCH /api/wrong-answers/:id/resolve', () => {
    it('sets resolvedAt on the wrong answer', async () => {
      const wa = await seedWrongAnswer(childId, submissionId);
      const res = await app.inject({
        method: 'PATCH', url: `/api/wrong-answers/${wa.id}/resolve`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const updated = await prisma.wrongAnswer.findUnique({ where: { id: wa.id } });
      expect(updated?.resolvedAt).not.toBeNull();
    });
  });

  describe('PATCH /api/wrong-answers/:id/unresolve', () => {
    it('clears resolvedAt', async () => {
      const wa = await prisma.wrongAnswer.create({
        data: {
          submissionId, childId, subject: 'math', questionNumber: 1, imageOrder: 1,
          questionText: 'Q', childAnswer: 'A', correctAnswer: 'B',
          status: 'wrong', explanation: 'E', resolvedAt: new Date(),
        },
      });
      const res = await app.inject({
        method: 'PATCH', url: `/api/wrong-answers/${wa.id}/unresolve`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const updated = await prisma.wrongAnswer.findUnique({ where: { id: wa.id } });
      expect(updated?.resolvedAt).toBeNull();
    });
  });

  describe('DELETE /api/wrong-answers/:id', () => {
    it('hard-deletes the wrong answer', async () => {
      const wa = await seedWrongAnswer(childId, submissionId);
      const res = await app.inject({
        method: 'DELETE', url: `/api/wrong-answers/${wa.id}`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(204);
      const deleted = await prisma.wrongAnswer.findUnique({ where: { id: wa.id } });
      expect(deleted).toBeNull();
    });

    it('returns 403 when wrong answer belongs to another parent', async () => {
      const auth2 = await registerParent(app, 'other@example.com');
      const wa = await seedWrongAnswer(childId, submissionId);
      const res = await app.inject({
        method: 'DELETE', url: `/api/wrong-answers/${wa.id}`,
        headers: { authorization: `Bearer ${auth2.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
