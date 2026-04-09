import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { prisma, cleanDb, registerParent } from './helpers';
import { clearAiConfigCache } from '../lib/ai-config';

vi.mock('../lib/practice-generator', () => ({
  generatePracticeQuestions: vi.fn().mockResolvedValue({
    questions: [
      { questionText: 'What is 6×3?', answer: '18', explanation: 'Multiply 6 by 3', topic: 'multiplication', difficulty: 'easy' },
      { questionText: 'What is 7×3?', answer: '21', explanation: 'Multiply 7 by 3', topic: 'multiplication', difficulty: 'easy' },
    ],
  }),
}));

describe('Practice routes', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let parentId: string;
  let childId: string;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    await cleanDb();
    clearAiConfigCache();

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

    const submission = await prisma.submission.create({
      data: { childId, imageCount: 1, status: 'completed' },
    });

    await prisma.wrongAnswer.create({
      data: {
        submissionId: submission.id, childId, subject: 'math',
        questionNumber: 1, imageOrder: 1, questionText: '5×3=?',
        childAnswer: '14', correctAnswer: '15', status: 'wrong',
        explanation: 'Multiplication error', topic: 'multiplication',
      },
    });
  });

  afterEach(async () => { await app.close(); });
  afterAll(async () => { await prisma.$disconnect(); });

  function auth() { return { authorization: `Bearer ${accessToken}` }; }

  describe('POST /api/practice/generate', () => {
    it('generates practice session with questions and deducts 1 token', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/practice/generate',
        headers: auth(),
        payload: { childId, subject: 'math', source: 'active', multiplier: 2 },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.id).toBeDefined();
      expect(data.questions).toHaveLength(2);
      expect(data.questions[0].questionText).toBe('What is 6×3?');

      const bal = await prisma.tokenBalance.findUnique({ where: { parentId } });
      expect(bal?.balance).toBe(2); // 3 - 1
    });

    it('returns 400 when no wrong answers exist for subject+source', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/practice/generate',
        headers: auth(),
        payload: { childId, subject: 'english', source: 'active', multiplier: 2 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('no_wrong_answers');
    });

    it('returns 402 when token balance is 0', async () => {
      await prisma.tokenBalance.update({ where: { parentId }, data: { balance: 0 } });
      const res = await app.inject({
        method: 'POST', url: '/api/practice/generate',
        headers: auth(),
        payload: { childId, subject: 'math', source: 'active', multiplier: 2 },
      });
      expect(res.statusCode).toBe(402);
    });
  });

  describe('GET /api/practice/sessions/:id', () => {
    it('returns session with questions', async () => {
      const genRes = await app.inject({
        method: 'POST', url: '/api/practice/generate',
        headers: auth(),
        payload: { childId, subject: 'math', source: 'active', multiplier: 2 },
      });
      const sessionId = genRes.json().id;

      const res = await app.inject({
        method: 'GET', url: `/api/practice/sessions/${sessionId}`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().questions).toHaveLength(2);
    });
  });
});
