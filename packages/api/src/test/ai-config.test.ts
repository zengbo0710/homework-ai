import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, cleanDb } from './helpers';
import { getAiConfig, clearAiConfigCache } from '../lib/ai-config';

describe('getAiConfig', () => {
  const AI_KEYS = ['ai_model', 'ai_max_tokens', 'ai_temperature', 'ai_provider'];

  beforeEach(async () => {
    await cleanDb();
    clearAiConfigCache();
    await prisma.systemConfig.deleteMany({ where: { key: { in: AI_KEYS } } });
    await prisma.systemConfig.createMany({
      data: [
        { key: 'ai_model', value: 'gpt-4o-mini' },
        { key: 'ai_max_tokens', value: 4096 },
        { key: 'ai_temperature', value: 0.1 },
        { key: 'ai_provider', value: 'openai' },
      ],
    });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('reads config from SystemConfig', async () => {
    const config = await getAiConfig(prisma);
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.maxTokens).toBe(4096);
    expect(config.temperature).toBe(0.1);
    expect(config.provider).toBe('openai');
  });

  it('returns defaults when keys are missing', async () => {
    await prisma.systemConfig.deleteMany({ where: { key: { in: AI_KEYS } } });
    clearAiConfigCache();
    const config = await getAiConfig(prisma);
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.maxTokens).toBe(4096);
  });
});
