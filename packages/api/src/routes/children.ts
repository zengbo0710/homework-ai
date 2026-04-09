import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../plugins/authenticate';
import { uploadsDir } from '../config';

const GRADE_MAP: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6 };

function gradeToInt(gradeLevel: string): number {
  const grade = GRADE_MAP[gradeLevel];
  if (grade === undefined) throw new Error(`Invalid gradeLevel: ${gradeLevel}`);
  return grade;
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

    if (body.name !== undefined && body.name.trim() === '') {
      return reply.status(400).send({ error: 'name_cannot_be_empty' });
    }
    if (body.gradeLevel !== undefined && !(body.gradeLevel in GRADE_MAP)) {
      return reply.status(400).send({ error: 'invalid_grade_level' });
    }

    const updated = await app.prisma.child.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.gradeLevel && body.gradeLevel in GRADE_MAP && { grade: gradeToInt(body.gradeLevel) }),
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

  app.post('/api/children/:id/avatar', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const child = await app.prisma.child.findUnique({ where: { id } });
    if (!child) return reply.status(404).send({ error: 'not_found' });
    if (child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'no_file' });

    if (!data.mimetype.startsWith('image/')) {
      return reply.status(400).send({ error: 'invalid_file_type' });
    }

    const buffer = await data.toBuffer();
    let filename: string;
    let outputPath: string;
    try {
      filename = `${uuidv4()}.jpg`;
      outputPath = path.join(uploadsDir, filename);
      await sharp(buffer)
        .resize(256, 256, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toFile(outputPath);
    } catch {
      // Clean up partial file if sharp failed
      if (outputPath!) {
        await fs.promises.unlink(outputPath!).catch(() => {});
      }
      return reply.status(400).send({ error: 'invalid_image' });
    }

    // Delete old avatar file if present
    if (child.avatarUrl) {
      const oldFilename = path.basename(child.avatarUrl);
      const oldPath = path.join(uploadsDir, oldFilename);
      await fs.promises.unlink(oldPath).catch(() => {});
    }

    const avatarUrl = `/uploads/avatars/${filename}`;
    await app.prisma.child.update({ where: { id }, data: { avatarUrl } });

    return reply.send({ avatarUrl });
  });
}
