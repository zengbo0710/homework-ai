import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, cleanDb } from './helpers';
import { deductToken, refundToken } from '../lib/token-helpers';

describe('deductToken', () => {
  beforeEach(async () => {
    await cleanDb();
    await prisma.parent.create({
      data: {
        id: 'parent-test',
        email: 'tok@test.com',
        passwordHash: 'hash',
        name: 'Tok',
        tokenBalance: {
          create: { balance: 5, totalEarned: 5, totalSpent: 0 },
        },
      },
    });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('decrements balance by 1 and logs a deduct transaction', async () => {
    await deductToken(prisma, 'parent-test', 'ref-1', 'submission');

    const bal = await prisma.tokenBalance.findUnique({ where: { parentId: 'parent-test' } });
    expect(bal?.balance).toBe(4);
    expect(bal?.totalSpent).toBe(1);

    const tx = await prisma.tokenTransaction.findFirst({
      where: { parentId: 'parent-test', type: 'deduct' },
    });
    expect(tx).not.toBeNull();
    expect(tx?.amount).toBe(1);
    expect(tx?.balanceAfter).toBe(4);
    expect(tx?.referenceId).toBe('ref-1');
  });

  it('throws when balance is 0', async () => {
    await prisma.tokenBalance.update({ where: { parentId: 'parent-test' }, data: { balance: 0 } });
    await expect(deductToken(prisma, 'parent-test', 'ref-2', 'submission')).rejects.toThrow('insufficient_tokens');
  });
});

describe('refundToken', () => {
  beforeEach(async () => {
    await cleanDb();
    await prisma.parent.create({
      data: {
        id: 'parent-test',
        email: 'tok@test.com',
        passwordHash: 'hash',
        name: 'Tok',
        tokenBalance: {
          create: { balance: 2, totalEarned: 5, totalSpent: 3 },
        },
      },
    });
  });

  it('increments balance by 1 and logs a refund transaction', async () => {
    await refundToken(prisma, 'parent-test', 'ref-3', 'submission');

    const bal = await prisma.tokenBalance.findUnique({ where: { parentId: 'parent-test' } });
    expect(bal?.balance).toBe(3);
    expect(bal?.totalSpent).toBe(2);

    const tx = await prisma.tokenTransaction.findFirst({
      where: { parentId: 'parent-test', type: 'refund' },
    });
    expect(tx).not.toBeNull();
    expect(tx?.amount).toBe(1);
    expect(tx?.balanceAfter).toBe(3);
  });
});
