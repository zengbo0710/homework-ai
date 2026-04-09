import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { prisma, cleanDb, registerParent } from './helpers';

vi.mock('../lib/weakness-analyzer', () => ({
  analyzeWeaknesses: vi.fn().mockResolvedValue({
    summary: 'The student struggles most with multiplication.',
    topicGroups: [{ topic: 'multiplication', wrongCount: 3, partialCount: 1 }],
    weaknesses: [{ rank: 1, topic: 'multiplication', severity: 'high', pattern: 'Confuses products', suggestion: 'Practice times tables' }],
  }),
}));

describe('Reports routes', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let parentId: string;
  let childId: string;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    await cleanDb();

    await prisma.systemConfig.createMany({
      skipDuplicates: true,
      data: [
        { key: 'ai_model', value: 'gpt-4o-mini' },
        { key: 'ai_max_tokens', value: 4096 },
        { key: 'ai_temperature', value: 0.1 },
        { key: 'ai_provider', value: 'openai' },
      ],
    });

    const auth = await registerParent(app);
    accessToken = auth.accessToken;
    parentId = auth.user.id;

    const childRes = await app.inject({
      method: 'POST', url: '/api/children',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Alice', gradeLevel: 'P3' },
    });
    childId = childRes.json().id;

    const submission = await prisma.submission.create({ data: { childId, imageCount: 1, status: 'completed' } });

    await prisma.wrongAnswer.createMany({
      data: [
        { submissionId: submission.id, childId, subject: 'math', questionNumber: 1, imageOrder: 1, questionText: '5×3=?', childAnswer: '14', correctAnswer: '15', status: 'wrong', explanation: 'E', topic: 'multiplication' },
        { submissionId: submission.id, childId, subject: 'math', questionNumber: 2, imageOrder: 1, questionText: '6×3=?', childAnswer: '16', correctAnswer: '18', status: 'wrong', explanation: 'E', topic: 'multiplication' },
      ],
    });
  });

  afterEach(async () => { await app.close(); });
  afterAll(async () => { await prisma.$disconnect(); });

  function auth() { return { authorization: `Bearer ${accessToken}` }; }

  describe('POST /api/reports/weakness', () => {
    it('generates report and deducts 1 token', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/reports/weakness',
        headers: auth(),
        payload: { childId, subject: 'math' },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.summary).toBe('The student struggles most with multiplication.');
      expect(data.weaknesses).toHaveLength(1);
      expect(data.weaknesses[0].rank).toBe(1);

      const bal = await prisma.tokenBalance.findUnique({ where: { parentId } });
      expect(bal?.balance).toBe(2);
    });

    it('returns 400 when no unresolved wrong answers exist', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/reports/weakness',
        headers: auth(),
        payload: { childId, subject: 'english' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('no_wrong_answers');
    });

    it('returns 402 when tokens are 0', async () => {
      await prisma.tokenBalance.update({ where: { parentId }, data: { balance: 0 } });
      const res = await app.inject({
        method: 'POST', url: '/api/reports/weakness',
        headers: auth(),
        payload: { childId, subject: 'math' },
      });
      expect(res.statusCode).toBe(402);
    });
  });

  describe('GET /api/reports/weakness', () => {
    it('returns latest report for child+subject', async () => {
      await app.inject({
        method: 'POST', url: '/api/reports/weakness',
        headers: auth(),
        payload: { childId, subject: 'math' },
      });

      const res = await app.inject({
        method: 'GET', url: `/api/reports/weakness?childId=${childId}&subject=math`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().summary).toBe('The student struggles most with multiplication.');
    });

    it('returns 404 when no report exists', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/reports/weakness?childId=${childId}&subject=english`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
