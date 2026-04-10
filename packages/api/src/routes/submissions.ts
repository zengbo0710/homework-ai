import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { Subject, WrongAnswerStatus } from '@prisma/client';
import { authenticate } from '../plugins/authenticate';
import { submissionsDir } from '../config';
import { deductToken, refundToken } from '../lib/token-helpers';
import { getAiVisionConfig } from '../lib/ai-config';
import { getAIClient } from '../lib/openai';
import { analyzeHomework } from '../lib/ai-analysis';

export async function submissionRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/submissions — upload 1-10 images, run AI analysis, return completed result
  app.post('/api/submissions', { preHandler: [authenticate] }, async (request, reply) => {
    const parts = request.parts();
    let childId: string | null = null;
    const imageBuffers: { buffer: Buffer; mimetype: string }[] = [];

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'childId') {
        childId = part.value as string;
      } else if (part.type === 'file' && part.fieldname === 'images') {
        if (imageBuffers.length >= 10) continue;
        const buf = await part.toBuffer();
        imageBuffers.push({ buffer: buf, mimetype: part.mimetype });
      }
    }

    if (!childId) return reply.status(400).send({ error: 'missing_childId' });
    if (imageBuffers.length === 0) return reply.status(400).send({ error: 'no_images' });

    for (const img of imageBuffers) {
      if (!img.mimetype.startsWith('image/')) {
        return reply.status(400).send({ error: 'invalid_file_type' });
      }
    }

    const child = await app.prisma.child.findUnique({
      where: { id: childId },
      select: { parentId: true, grade: true },
    });
    if (!child) return reply.status(404).send({ error: 'child_not_found' });
    if (child.parentId !== request.parentId) return reply.status(403).send({ error: 'forbidden' });

    // Check token balance before processing
    const balance = await app.prisma.tokenBalance.findUnique({ where: { parentId: request.parentId } });
    if (!balance || balance.balance < 1) {
      return reply.status(402).send({ error: 'insufficient_tokens' });
    }

    // Resize and save images, retain processed buffers for AI
    fs.mkdirSync(submissionsDir, { recursive: true });
    const savedImages: { imageUrl: string; sortOrder: number }[] = [];
    const processedBuffers: Buffer[] = [];

    try {
      for (let i = 0; i < imageBuffers.length; i++) {
        const processed = await sharp(imageBuffers[i].buffer)
          .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        const filename = `${uuidv4()}.jpg`;
        fs.writeFileSync(path.join(submissionsDir, filename), processed);
        savedImages.push({ imageUrl: `/uploads/submissions/${filename}`, sortOrder: i + 1 });
        processedBuffers.push(processed);
      }
    } catch {
      return reply.status(400).send({ error: 'invalid_image' });
    }

    // Create submission with processing status
    const submission = await app.prisma.submission.create({
      data: {
        childId,
        imageCount: savedImages.length,
        status: 'processing',
        images: { create: savedImages },
      },
    });

    // Deduct token (refund on any subsequent failure)
    try {
      await deductToken(app.prisma, request.parentId, submission.id, 'submission');
    } catch {
      await app.prisma.submission.update({
        where: { id: submission.id },
        data: { status: 'failed', errorMessage: 'Insufficient tokens' },
      });
      return reply.status(402).send({ error: 'insufficient_tokens' });
    }

    // Call AI
    try {
      const aiConfig = await getAiVisionConfig(app.prisma);
      const client = getAIClient(aiConfig.provider);
      const result = await analyzeHomework(client, processedBuffers, child.grade, aiConfig);

      await app.prisma.aiResponse.create({
        data: {
          submissionId: submission.id,
          rawResponse: result as object,
          summary: result.summary,
          totalQuestions: result.totalQuestions,
          correctCount: result.correctCount,
          partialCorrectCount: result.partialCorrectCount,
          wrongCount: result.wrongCount,
          modelUsed: aiConfig.model,
          latencyMs: result.latencyMs,
        },
      });

      // Save only wrong + partial_correct to DB
      const toSave = result.questions.filter((q) => q.status !== 'correct');
      for (const q of toSave) {
        await app.prisma.wrongAnswer.create({
          data: {
            submissionId: submission.id,
            childId,
            subject: result.subject as Subject,
            questionNumber: q.questionNumber,
            imageOrder: q.imageOrder,
            questionText: q.questionText,
            childAnswer: q.childAnswer ?? null,
            correctAnswer: q.correctAnswer,
            status: q.status as WrongAnswerStatus,
            explanation: q.explanation,
            topic: q.topic ?? null,
            difficulty: q.difficulty ?? null,
          },
        });
      }

      await app.prisma.submission.update({
        where: { id: submission.id },
        data: { status: 'completed', detectedSubject: result.subject as Subject },
      });

      const updated = await app.prisma.submission.findUnique({
        where: { id: submission.id },
        include: {
          images: { orderBy: { sortOrder: 'asc' } },
          aiResponse: true,
          wrongAnswers: { orderBy: { questionNumber: 'asc' } },
        },
      });

      return reply.status(201).send({
        id: updated!.id,
        childId: updated!.childId,
        status: updated!.status,
        detectedSubject: updated!.detectedSubject,
        imageCount: updated!.imageCount,
        images: updated!.images.map((img) => ({
          id: img.id,
          imageUrl: img.imageUrl,
          sortOrder: img.sortOrder,
        })),
        aiResponse: updated!.aiResponse
          ? {
              summary: updated!.aiResponse.summary,
              totalQuestions: updated!.aiResponse.totalQuestions,
              correctCount: updated!.aiResponse.correctCount,
              partialCorrectCount: updated!.aiResponse.partialCorrectCount,
              wrongCount: updated!.aiResponse.wrongCount,
            }
          : null,
        wrongAnswers: updated!.wrongAnswers.map((wa) => ({
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
        createdAt: updated!.createdAt,
      });
    } catch (err) {
      console.error('[submissions] ai_analysis_failed:', err);
      await refundToken(app.prisma, request.parentId, submission.id, 'submission').catch(() => {});
      await app.prisma.submission.update({
        where: { id: submission.id },
        data: {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'AI analysis failed',
        },
      });
      return reply.status(500).send({ error: 'ai_analysis_failed' });
    }
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
