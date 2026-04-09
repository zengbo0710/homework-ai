import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/authenticate';

const GRADE_MAP: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6 };

function gradeToInt(gradeLevel: string): number {
  return GRADE_MAP[gradeLevel] ?? 1;
}

function intToGrade(grade: number): string {
  return `P${grade}`;
}

function formatChild(child: {
  id: string;
  name: string;
  grade: number;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: child.id,
    name: child.name,
    gradeLevel: intToGrade(child.grade),
    avatarUrl: child.avatarUrl,
    createdAt: child.createdAt,
    updatedAt: child.updatedAt,
  };
}

export async function childrenRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/children', { preHandler: [authenticate] }, async (request, reply) => {
    const children = await app.prisma.child.findMany({
      where: { parentId: request.parentId },
      orderBy: { createdAt: 'asc' },
    });
    return reply.send(children.map(formatChild));
  });

  app.post('/api/children', { preHandler: [authenticate] }, async (request, reply) => {
    const body = request.body as { name?: string; gradeLevel?: string };
    if (!body.name || !body.gradeLevel || !GRADE_MAP[body.gradeLevel]) {
      return reply.status(400).send({ error: 'missing_or_invalid_fields' });
    }
    const count = await app.prisma.child.count({ where: { parentId: request.parentId } });
    if (count >= 5) {
      return reply.status(422).send({ error: 'max_children_reached' });
    }
    const child = await app.prisma.child.create({
      data: {
        parentId: request.parentId,
        name: body.name,
        grade: gradeToInt(body.gradeLevel),
      },
    });
    return reply.status(201).send(formatChild(child));
  });

  app.put('/api/children/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; gradeLevel?: string };

    const child = await app.prisma.child.findUnique({ where: { id } });
    if (!child) return reply.status(404).send({ error: 'not_found' });
    if (child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    const updated = await app.prisma.child.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.gradeLevel && GRADE_MAP[body.gradeLevel] && { grade: gradeToInt(body.gradeLevel) }),
      },
    });
    return reply.send(formatChild(updated));
  });

  app.delete('/api/children/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const child = await app.prisma.child.findUnique({ where: { id } });
    if (!child) return reply.status(404).send({ error: 'not_found' });
    if (child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    await app.prisma.child.delete({ where: { id } });
    return reply.status(204).send();
  });
}
