import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../plugins/authenticate';
import { submissionsDir } from '../config';

export async function submissionRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/submissions — upload 1-10 images, create submission record
  app.post('/api/submissions', { preHandler: [authenticate] }, async (request, reply) => {
    // Parse multipart: childId field + images[] files
    const parts = request.parts();
    let childId: string | null = null;
    const imageBuffers: { buffer: Buffer; mimetype: string }[] = [];

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'childId') {
        childId = part.value as string;
      } else if (part.type === 'file' && part.fieldname === 'images') {
        if (imageBuffers.length >= 10) continue; // ignore extras
        const buf = await part.toBuffer();
        imageBuffers.push({ buffer: buf, mimetype: part.mimetype });
      }
    }

    if (!childId) return reply.status(400).send({ error: 'missing_childId' });
    if (imageBuffers.length === 0) return reply.status(400).send({ error: 'no_images' });
    if (imageBuffers.length > 10) return reply.status(400).send({ error: 'too_many_images' });

    // Validate child ownership
    const child = await app.prisma.child.findUnique({ where: { id: childId } });
    if (!child) return reply.status(404).send({ error: 'child_not_found' });
    if (child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    // Validate all images are image/* MIME
    for (const img of imageBuffers) {
      if (!img.mimetype.startsWith('image/')) {
        return reply.status(400).send({ error: 'invalid_file_type' });
      }
    }

    // Ensure submissions dir exists
    fs.mkdirSync(submissionsDir, { recursive: true });

    // Save each image (resize to max 1600px, JPEG quality 85)
    const savedImages: { imageUrl: string; sortOrder: number }[] = [];
    for (let i = 0; i < imageBuffers.length; i++) {
      const filename = `${uuidv4()}.jpg`;
      const outputPath = path.join(submissionsDir, filename);
      await sharp(imageBuffers[i].buffer)
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(outputPath);
      savedImages.push({ imageUrl: `/uploads/submissions/${filename}`, sortOrder: i + 1 });
    }

    // Create submission + images in DB
    const submission = await app.prisma.submission.create({
      data: {
        childId,
        imageCount: savedImages.length,
        status: 'pending',
        images: {
          create: savedImages,
        },
      },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    return reply.status(201).send({
      id: submission.id,
      childId: submission.childId,
      status: submission.status,
      imageCount: submission.imageCount,
      images: submission.images.map((img) => ({
        id: img.id,
        imageUrl: img.imageUrl,
        sortOrder: img.sortOrder,
      })),
      createdAt: submission.createdAt,
    });
  });

  // GET /api/submissions/:id — get submission with status, images, AI result
  app.get('/api/submissions/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const submission = await app.prisma.submission.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        aiResponse: true,
        wrongAnswers: { orderBy: { questionNumber: 'asc' } },
        child: true,
      },
    });
    if (!submission) return reply.status(404).send({ error: 'not_found' });
    if (submission.child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    return reply.send({
      id: submission.id,
      childId: submission.childId,
      status: submission.status,
      detectedSubject: submission.detectedSubject,
      imageCount: submission.imageCount,
      errorMessage: submission.errorMessage,
      images: submission.images.map((img) => ({
        id: img.id,
        imageUrl: img.imageUrl,
        sortOrder: img.sortOrder,
      })),
      aiResponse: submission.aiResponse ? {
        summary: submission.aiResponse.summary,
        totalQuestions: submission.aiResponse.totalQuestions,
        correctCount: submission.aiResponse.correctCount,
        partialCorrectCount: submission.aiResponse.partialCorrectCount,
        wrongCount: submission.aiResponse.wrongCount,
      } : null,
      wrongAnswers: submission.wrongAnswers.map((wa) => ({
        id: wa.id,
        questionNumber: wa.questionNumber,
        questionText: wa.questionText,
        childAnswer: wa.childAnswer,
        correctAnswer: wa.correctAnswer,
        status: wa.status,
        explanation: wa.explanation,
        topic: wa.topic,
        resolvedAt: wa.resolvedAt,
      })),
      createdAt: submission.createdAt,
    });
  });

  // GET /api/submissions?childId=&page=&limit= — list submissions for a child
  app.get('/api/submissions', { preHandler: [authenticate] }, async (request, reply) => {
    const query = request.query as { childId?: string; page?: string; limit?: string };
    if (!query.childId) return reply.status(400).send({ error: 'missing_childId' });

    const child = await app.prisma.child.findUnique({ where: { id: query.childId } });
    if (!child) return reply.status(404).send({ error: 'child_not_found' });
    if (child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      app.prisma.submission.findMany({
        where: { childId: query.childId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      }),
      app.prisma.submission.count({ where: { childId: query.childId } }),
    ]);

    return reply.send({
      data: submissions.map((s) => ({
        id: s.id,
        childId: s.childId,
        status: s.status,
        detectedSubject: s.detectedSubject,
        imageCount: s.imageCount,
        thumbnailUrl: s.images[0]?.imageUrl ?? null,
        createdAt: s.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });
}
