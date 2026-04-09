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
        { id: 'starter', tokens: 10, price_cents: 199, currency: 'USD' },
        { id: 'standard', tokens: 50, price_cents: 799, currency: 'USD' },
        { id: 'bulk', tokens: 200, price_cents: 2499, currency: 'USD' },
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

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
