import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const configs: { key: string; value: unknown; description: string }[] = [
    // Token economy
    { key: 'free_tokens_on_register', value: 3, description: 'Number of free AI tokens granted to new users' },
    { key: 'tokens_per_submission', value: 1, description: 'Tokens consumed per homework scan' },
    { key: 'tokens_per_practice', value: 1, description: 'Tokens consumed per practice generation' },
    { key: 'tokens_per_report', value: 1, description: 'Tokens consumed per weakness report' },
    {
      key: 'token_packages',
      value: [
        { id: 'starter', tokens: 10, priceCents: 199, currency: 'USD' },
        { id: 'standard', tokens: 50, priceCents: 799, currency: 'USD' },
        { id: 'bulk', tokens: 200, priceCents: 2499, currency: 'USD' },
      ],
      description: 'Available token purchase packages',
    },

    // AI text config (practice generation, weakness reports) — DeepSeek by default
    { key: 'ai_provider', value: 'deepseek', description: 'AI provider for text tasks (practice, reports)' },
    { key: 'ai_model', value: 'deepseek-chat', description: 'Model name for text tasks' },
    { key: 'ai_max_tokens', value: 8192, description: 'Max completion tokens for text AI calls' },
    { key: 'ai_temperature', value: 0.1, description: 'Sampling temperature for text AI calls' },

    // AI vision config (homework scanning) — OpenAI gpt-4o-mini by default
    { key: 'ai_vision_provider', value: 'openai', description: 'AI provider for vision tasks (homework scanning)' },
    { key: 'ai_vision_model', value: 'gpt-4o-mini', description: 'Model name for vision tasks' },
    { key: 'ai_vision_max_tokens', value: 8192, description: 'Max completion tokens for vision AI calls' },
    { key: 'ai_vision_temperature', value: 0.1, description: 'Sampling temperature for vision AI calls' },
  ];

  for (const cfg of configs) {
    await prisma.systemConfig.upsert({
      where: { key: cfg.key },
      update: {}, // never overwrite values already set by an admin
      create: { key: cfg.key, value: cfg.value, description: cfg.description },
    });
  }

  console.log(`Seed complete — ${configs.length} system config entries ensured.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
