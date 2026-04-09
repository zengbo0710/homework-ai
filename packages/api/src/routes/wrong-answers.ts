import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/authenticate';

const SUBJECTS = ['math', 'english', 'science', 'chinese', 'higher_chinese'] as const;

export async function wrongAnswerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/wrong-answers/summary', { preHandler: [authenticate] }, async (request, reply) => {
    const { childId } = request.query as { childId?: string };
    if (!childId) return reply.status(400).send({ error: 'missing_childId' });

    const child = await app.prisma.child.findUnique({ where: { id: childId }, select: { parentId: true } });
    if (!child) return reply.status(404).send({ error: 'child_not_found' });
    if (child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    const counts = await app.prisma.wrongAnswer.groupBy({
      by: ['subject'],
      where: { childId, resolvedAt: null },
      _count: { id: true },
    });

    const summary: Record<string, number> = Object.fromEntries(SUBJECTS.map((s) => [s, 0]));
    for (const row of counts) {
      summary[row.subject] = row._count.id;
    }
    return reply.send(summary);
  });

  app.get('/api/wrong-answers', { preHandler: [authenticate] }, async (request, reply) => {
    const query = request.query as { childId?: string; subject?: string; resolved?: string; page?: string; limit?: string };
    if (!query.childId) return reply.status(400).send({ error: 'missing_childId' });

    const child = await app.prisma.child.findUnique({ where: { id: query.childId }, select: { parentId: true } });
    if (!child) return reply.status(404).send({ error: 'child_not_found' });
    if (child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    const isResolved = query.resolved === 'true';
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * limit;

    const where = {
      childId: query.childId,
      ...(query.subject ? { subject: query.subject as any } : {}),
      ...(isResolved ? { resolvedAt: { not: null } } : { resolvedAt: null }),
    };

    const [data, total] = await Promise.all([
      app.prisma.wrongAnswer.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      app.prisma.wrongAnswer.count({ where }),
    ]);

    return reply.send({
      data: data.map((wa) => ({
        id: wa.id,
        subject: wa.subject,
        questionNumber: wa.questionNumber,
        questionText: wa.questionText,
        childAnswer: wa.childAnswer,
        correctAnswer: wa.correctAnswer,
        status: wa.status,
        explanation: wa.explanation,
        topic: wa.topic,
        resolvedAt: wa.resolvedAt,
        createdAt: wa.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  app.patch('/api/wrong-answers/:id/resolve', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const wa = await app.prisma.wrongAnswer.findUnique({ where: { id }, include: { child: { select: { parentId: true } } } });
    if (!wa) return reply.status(404).send({ error: 'not_found' });
    if (wa.child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });
    const updated = await app.prisma.wrongAnswer.update({ where: { id }, data: { resolvedAt: new Date() } });
    return reply.send({ id: updated.id, resolvedAt: updated.resolvedAt });
  });

  app.patch('/api/wrong-answers/:id/unresolve', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const wa = await app.prisma.wrongAnswer.findUnique({ where: { id }, include: { child: { select: { parentId: true } } } });
    if (!wa) return reply.status(404).send({ error: 'not_found' });
    if (wa.child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });
    const updated = await app.prisma.wrongAnswer.update({ where: { id }, data: { resolvedAt: null } });
    return reply.send({ id: updated.id, resolvedAt: updated.resolvedAt });
  });

  app.delete('/api/wrong-answers/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const wa = await app.prisma.wrongAnswer.findUnique({ where: { id }, include: { child: { select: { parentId: true } } } });
    if (!wa) return reply.status(404).send({ error: 'not_found' });
    if (wa.child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });
    await app.prisma.wrongAnswer.delete({ where: { id } });
    return reply.status(204).send();
  });
}
