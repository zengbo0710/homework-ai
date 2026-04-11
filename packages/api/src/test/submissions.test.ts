import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { prisma, cleanDb, registerParent } from './helpers';

// Mock sharp so tests don't do real image processing
vi.mock('sharp', () => {
  const fakeSharp = () => ({
    resize: () => fakeSharp(),
    jpeg: () => fakeSharp(),
    extract: () => fakeSharp(),
    toBuffer: () => Promise.resolve(Buffer.from('fake-processed-image')),
    metadata: () => Promise.resolve({ width: 800, height: 1000 }),
  });
  return { default: fakeSharp };
});

// Mock analyzeHomework so tests don't call real OpenAI
vi.mock('../lib/ai-analysis', () => ({
  analyzeHomework: vi.fn().mockResolvedValue({
    subject: 'math',
    summary: 'Good work',
    totalQuestions: 2,
    correctCount: 1,
    partialCorrectCount: 0,
    wrongCount: 1,
    figures: [],
    questions: [
      {
        questionNumber: 1, imageOrder: 1, questionText: '1+1=?', childAnswer: '2',
        correctAnswer: '2', status: 'correct', explanation: '', topic: 'addition', difficulty: 'easy',
        figureId: null,
      },
      {
        questionNumber: 2, imageOrder: 1, questionText: '5×3=?', childAnswer: '14',
        correctAnswer: '15', status: 'wrong', explanation: 'Multiplication error',
        topic: 'multiplication', difficulty: 'medium', figureId: null,
      },
    ],
    latencyMs: 500,
  }),
}));

// Minimal valid JPEG (1×1 pixel)
const minimalJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
  'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIA' +
  'AhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAU' +
  'AQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A' +
  'JQAB/9k=',
  'base64'
);

function buildMultipart(childId: string, imageBuffer: Buffer) {
  const boundary = 'TestBoundary123';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="childId"\r\n\r\n${childId}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('POST /api/submissions', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let parentId: string;
  let childId: string;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    await cleanDb();

    await prisma.systemConfig.createMany({
      data: [
        { key: 'ai_model', value: 'gpt-4o-mini' },
        { key: 'ai_max_tokens', value: 4096 },
        { key: 'ai_temperature', value: 0.1 },
        { key: 'ai_provider', value: 'openai' },
      ],
      skipDuplicates: true,
    });

    const auth = await registerParent(app);
    accessToken = auth.accessToken;
    parentId = auth.user.id;

    const childRes = await app.inject({
      method: 'POST',
      url: '/api/children',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Test Child', gradeLevel: 'P3' },
    });
    childId = childRes.json().id;
  });

  afterEach(async () => { await app.close(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('returns 201 with completed AI result and deducts 1 token', async () => {
    const { body, contentType } = buildMultipart(childId, minimalJpeg);

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.status).toBe('completed');
    expect(data.detectedSubject).toBe('math');
    expect(data.aiResponse).not.toBeNull();
    expect(data.aiResponse.totalQuestions).toBe(2);
    expect(data.wrongAnswers).toHaveLength(1); // only wrong, not correct
    expect(data.wrongAnswers[0].questionText).toBe('5×3=?');

    const bal = await prisma.tokenBalance.findUnique({ where: { parentId } });
    expect(bal?.balance).toBe(2); // started at 3, deducted 1
  });

  it('returns 402 when token balance is 0', async () => {
    await prisma.tokenBalance.update({ where: { parentId }, data: { balance: 0 } });
    const { body, contentType } = buildMultipart(childId, minimalJpeg);

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(402);
    expect(res.json().error).toBe('insufficient_tokens');
  });

  it('returns 400 when no images are provided', async () => {
    const boundary = 'TestBoundary123';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="childId"\r\n\r\n${childId}\r\n`),
      Buffer.from(`--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(400);
  });
});
