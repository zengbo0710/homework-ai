import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.systemConfig.upsert({
    where: { key: 'free_tokens_on_register' },
    update: {},
    create: {
      key: 'free_tokens_on_register',
      value: 3,
      description: 'Number of free AI tokens granted to new users',
    },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'token_packages' },
    update: {},
    create: {
      key: 'token_packages',
      value: [
        { id: 'starter', tokens: 10, priceCents: 199, currency: 'USD' },
        { id: 'standard', tokens: 50, priceCents: 799, currency: 'USD' },
        { id: 'bulk', tokens: 200, priceCents: 2499, currency: 'USD' },
      ],
      description: 'Available token purchase packages',
    },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'tokens_per_submission' },
    update: {},
    create: {
      key: 'tokens_per_submission',
      value: 1,
      description: 'Tokens consumed per homework scan',
    },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'tokens_per_practice' },
    update: {},
    create: {
      key: 'tokens_per_practice',
      value: 1,
      description: 'Tokens consumed per practice generation',
    },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'ai_provider' },
    update: {},
    create: { key: 'ai_provider', value: 'openai', description: 'AI provider identifier' },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'ai_model' },
    update: {},
    create: { key: 'ai_model', value: 'gpt-4o-mini', description: 'OpenAI model name' },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'ai_max_tokens' },
    update: {},
    create: { key: 'ai_max_tokens', value: 4096, description: 'Max completion tokens per AI call' },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'ai_temperature' },
    update: {},
    create: { key: 'ai_temperature', value: 0.1, description: 'Sampling temperature for AI calls' },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
