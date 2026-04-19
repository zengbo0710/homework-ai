import { FastifyInstance } from 'fastify';
import { Subject } from '@prisma/client';
import { authenticate } from '../plugins/authenticate';
import { deductToken, refundToken } from '../lib/token-helpers';
import { getAiConfig } from '../lib/ai-config';
import { getAIClient } from '../lib/openai';
import { generatePracticeQuestions } from '../lib/practice-generator';

export async function practiceRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/practice/generate
  app.post('/api/practice/generate', { preHandler: [authenticate] }, async (request, reply) => {
    const { childId, subject, source, multiplier = 2 } = request.body as {
      childId: string;
      subject: string;
      source: 'active' | 'resolved';
      multiplier?: number;
    };

    if (!childId || !subject || !source) {
      return reply.status(400).send({ error: 'missing_fields' });
    }

    const child = await app.prisma.child.findUnique({
      where: { id: childId },
      select: { parentId: true, grade: true },
    });
    if (!child) return reply.status(404).send({ error: 'child_not_found' });
    if (child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    const balance = await app.prisma.tokenBalance.findUnique({ where: { parentId: request.parentId } });
    if (!balance || balance.balance < 1) return reply.status(402).send({ error: 'insufficient_tokens' });

    const wrongAnswers = await app.prisma.wrongAnswer.findMany({
      where: {
        childId,
        subject: subject as Subject,
        ...(source === 'active' ? { resolvedAt: null } : { resolvedAt: { not: null } }),
      },
    });

    if (wrongAnswers.length === 0) return reply.status(400).send({ error: 'no_wrong_answers' });

    // Create session record first (to get ID for token reference)
    const session = await app.prisma.practiceSession.create({
      data: {
        childId,
        subject: subject as Subject,
        sourceType: source,
        multiplier,
        totalQuestions: 0, // updated after generation
      },
    });

    // Link source wrong answers
    await app.prisma.practiceSessionSource.createMany({
      data: wrongAnswers.map((wa) => ({ practiceSessionId: session.id, wrongAnswerId: wa.id })),
    });

    // Deduct token
    try {
      await deductToken(app.prisma, request.parentId, session.id, 'practice');
    } catch {
      await app.prisma.practiceSession.delete({ where: { id: session.id } });
      return reply.status(402).send({ error: 'insufficient_tokens' });
    }

    // Generate questions
    try {
      const aiConfig = await getAiConfig(app.prisma);
      const client = getAIClient(aiConfig.provider);
      const result = await generatePracticeQuestions(client, wrongAnswers, child.grade, multiplier, aiConfig);

      const questions = await Promise.all(
        result.questions.map((q, i) =>
          app.prisma.practiceQuestion.create({
            data: {
              practiceSessionId: session.id,
              questionText: q.questionText,
              answer: q.answer,
              topic: q.topic ?? null,
              difficulty: q.difficulty ?? null,
              sortOrder: i + 1,
            },
          })
        )
      );

      await app.prisma.practiceSession.update({
        where: { id: session.id },
        data: { totalQuestions: questions.length },
      });

      return reply.status(201).send({
        id: session.id,
        childId,
        subject,
        sourceType: source,
        multiplier,
        totalQuestions: questions.length,
        questions: questions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          answer: q.answer,
          topic: q.topic,
          difficulty: q.difficulty,
          sortOrder: q.sortOrder,
        })),
        generatedAt: session.generatedAt,
      });
    } catch (err) {
      console.error('[practice] generation error:', err);
      await refundToken(app.prisma, request.parentId, session.id, 'practice').catch(() => {});
      await app.prisma.practiceSession.delete({ where: { id: session.id } }).catch(() => {});
      return reply.status(500).send({ error: 'generation_failed' });
    }
  });

  // GET /api/practice/sessions?childId=&subject=&page=&limit=
  app.get('/api/practice/sessions', { preHandler: [authenticate] }, async (request, reply) => {
    const query = request.query as { childId?: string; subject?: string; page?: string; limit?: string };
    if (!query.childId) return reply.status(400).send({ error: 'missing_childId' });

    const child = await app.prisma.child.findUnique({ where: { id: query.childId }, select: { parentId: true } });
    if (!child) return reply.status(404).send({ error: 'child_not_found' });
    if (child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)));

    const sessions = await app.prisma.practiceSession.findMany({
      where: {
        childId: query.childId,
        ...(query.subject ? { subject: query.subject as Subject } : {}),
      },
      orderBy: { generatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return reply.send(sessions.map((s) => ({
      id: s.id, childId: s.childId, subject: s.subject,
      sourceType: s.sourceType, totalQuestions: s.totalQuestions, generatedAt: s.generatedAt,
    })));
  });

  // GET /api/practice/sessions/:id
  app.get('/api/practice/sessions/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await app.prisma.practiceSession.findUnique({
      where: { id },
      include: {
        child: { select: { parentId: true } },
        questions: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!session) return reply.status(404).send({ error: 'not_found' });
    if (session.child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    return reply.send({
      id: session.id,
      childId: session.childId,
      subject: session.subject,
      sourceType: session.sourceType,
      multiplier: session.multiplier,
      totalQuestions: session.totalQuestions,
      generatedAt: session.generatedAt,
      questions: session.questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        answer: q.answer,
        topic: q.topic,
        difficulty: q.difficulty,
        sortOrder: q.sortOrder,
      })),
    });
  });
}
