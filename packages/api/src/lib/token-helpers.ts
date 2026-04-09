import { PrismaClient } from '@prisma/client';

export async function deductToken(
  prisma: PrismaClient,
  parentId: string,
  referenceId: string,
  referenceType: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const balance = await tx.tokenBalance.findUnique({ where: { parentId } });
    if (!balance || balance.balance < 1) throw new Error('insufficient_tokens');
    await tx.tokenBalance.update({
      where: { parentId },
      data: { balance: { decrement: 1 }, totalSpent: { increment: 1 } },
    });
    await tx.tokenTransaction.create({
      data: {
        parentId,
        type: 'deduct',
        amount: 1,
        balanceAfter: balance.balance - 1,
        referenceId,
        referenceType,
        description: `AI token deduction for ${referenceType}`,
      },
    });
  });
}

export async function refundToken(
  prisma: PrismaClient,
  parentId: string,
  referenceId: string,
  referenceType: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.tokenBalance.update({
      where: { parentId },
      data: { balance: { increment: 1 }, totalSpent: { decrement: 1 } },
    });
    await tx.tokenTransaction.create({
      data: {
        parentId,
        type: 'refund',
        amount: 1,
        balanceAfter: updated.balance,
        referenceId,
        referenceType,
        description: `Token refund for failed ${referenceType}`,
      },
    });
  });
}
