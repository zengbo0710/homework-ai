import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/authenticate';
import { deductToken, refundToken } from '../lib/token-helpers';
import { getAiConfig } from '../lib/ai-config';
import { getOpenAIClient } from '../lib/openai';
import { analyzeWeaknesses } from '../lib/weakness-analyzer';

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/reports/weakness
  app.post('/api/reports/weakness', { preHandler: [authenticate] }, async (request, reply) => {
    const { childId, subject } = request.body as { childId: string; subject: string };

    if (!childId || !subject) return reply.status(400).send({ error: 'missing_fields' });

    const child = await app.prisma.child.findUnique({
      where: { id: childId },
      select: { parentId: true, grade: true },
    });
    if (!child) return reply.status(404).send({ error: 'child_not_found' });
    if (child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    const balance = await app.prisma.tokenBalance.findUnique({ where: { parentId: request.parentId } });
    if (!balance || balance.balance < 1) return reply.status(402).send({ error: 'insufficient_tokens' });

    const wrongAnswers = await app.prisma.wrongAnswer.findMany({
      where: { childId, subject: subject as any, resolvedAt: null },
    });
    if (wrongAnswers.length === 0) return reply.status(400).send({ error: 'no_wrong_answers' });

    // Pre-generate ID so we can reference it in the token transaction
    const reportId = randomUUID();

    try {
      await deductToken(app.prisma, request.parentId, reportId, 'report');
    } catch {
      return reply.status(402).send({ error: 'insufficient_tokens' });
    }

    try {
      const aiConfig = await getAiConfig(app.prisma);
      const client = getOpenAIClient();
      const result = await analyzeWeaknesses(client, wrongAnswers, child.grade, aiConfig);

      const report = await app.prisma.weaknessReport.create({
        data: {
          id: reportId,
          childId,
          subject: subject as any,
          sourceWrongIds: wrongAnswers.map((wa) => wa.id),
          topicGroups: result.topicGroups as any,
          weaknesses: result.weaknesses as any,
          summary: result.summary,
          totalQuestions: wrongAnswers.length,
          totalTopics: result.topicGroups.length,
          modelUsed: aiConfig.model,
        },
      });

      return reply.status(201).send({
        id: report.id,
        childId: report.childId,
        subject: report.subject,
        summary: report.summary,
        topicGroups: report.topicGroups,
        weaknesses: report.weaknesses,
        totalQuestions: report.totalQuestions,
        totalTopics: report.totalTopics,
        createdAt: report.createdAt,
      });
    } catch (err) {
      await refundToken(app.prisma, request.parentId, reportId, 'report').catch(() => {});
      return reply.status(500).send({ error: 'report_generation_failed' });
    }
  });

  // GET /api/reports/weakness?childId=&subject=
  app.get('/api/reports/weakness', { preHandler: [authenticate] }, async (request, reply) => {
    const { childId, subject } = request.query as { childId?: string; subject?: string };
    if (!childId || !subject) return reply.status(400).send({ error: 'missing_fields' });

    const child = await app.prisma.child.findUnique({ where: { id: childId }, select: { parentId: true } });
    if (!child) return reply.status(404).send({ error: 'child_not_found' });
    if (child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    const report = await app.prisma.weaknessReport.findFirst({
      where: { childId, subject: subject as any },
      orderBy: { createdAt: 'desc' },
    });
    if (!report) return reply.status(404).send({ error: 'not_found' });

    return reply.send({
      id: report.id,
      childId: report.childId,
      subject: report.subject,
      summary: report.summary,
      topicGroups: report.topicGroups,
      weaknesses: report.weaknesses,
      totalQuestions: report.totalQuestions,
      totalTopics: report.totalTopics,
      createdAt: report.createdAt,
    });
  });
}
