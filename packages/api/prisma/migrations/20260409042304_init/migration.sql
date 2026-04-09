-- CreateTable
CREATE TABLE `parents` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `locale` VARCHAR(10) NOT NULL DEFAULT 'en',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `parents_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_config` (
    `key` VARCHAR(100) NOT NULL,
    `value` JSON NOT NULL,
    `description` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `token_balances` (
    `parentId` VARCHAR(191) NOT NULL,
    `balance` INTEGER NOT NULL DEFAULT 0,
    `totalEarned` INTEGER NOT NULL DEFAULT 0,
    `totalSpent` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`parentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `token_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NOT NULL,
    `type` ENUM('grant', 'purchase', 'deduct', 'refund') NOT NULL,
    `amount` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `referenceId` VARCHAR(36) NULL,
    `referenceType` VARCHAR(30) NULL,
    `description` TEXT NULL,
    `paymentId` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `token_transactions_parentId_idx`(`parentId`),
    INDEX `token_transactions_parentId_createdAt_idx`(`parentId`, `createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `children` (
    `id` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `grade` INTEGER NOT NULL,
    `avatarUrl` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `children_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `submissions` (
    `id` VARCHAR(191) NOT NULL,
    `childId` VARCHAR(191) NOT NULL,
    `detectedSubject` ENUM('math', 'english', 'science', 'chinese', 'higher_chinese') NULL,
    `imageCount` INTEGER NOT NULL,
    `status` ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    `errorMessage` TEXT NULL,
    `aiProvider` VARCHAR(30) NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `submissions_childId_idx`(`childId`),
    INDEX `submissions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `submission_images` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `imageUrl` VARCHAR(500) NOT NULL,
    `imageHash` VARCHAR(64) NULL,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `submission_images_submissionId_idx`(`submissionId`),
    UNIQUE INDEX `submission_images_submissionId_sortOrder_key`(`submissionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_responses` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `rawResponse` JSON NOT NULL,
    `summary` TEXT NULL,
    `totalQuestions` INTEGER NULL,
    `correctCount` INTEGER NULL,
    `partialCorrectCount` INTEGER NULL,
    `wrongCount` INTEGER NULL,
    `modelUsed` VARCHAR(50) NULL,
    `tokensUsed` INTEGER NULL,
    `costUsd` DECIMAL(8, 5) NULL,
    `latencyMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ai_responses_submissionId_key`(`submissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wrong_answers` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `childId` VARCHAR(191) NOT NULL,
    `subject` ENUM('math', 'english', 'science', 'chinese', 'higher_chinese') NOT NULL,
    `questionNumber` INTEGER NOT NULL,
    `imageOrder` INTEGER NOT NULL,
    `questionText` TEXT NOT NULL,
    `childAnswer` TEXT NULL,
    `correctAnswer` TEXT NOT NULL,
    `status` ENUM('wrong', 'partial_correct') NOT NULL,
    `explanation` TEXT NOT NULL,
    `topic` VARCHAR(100) NULL,
    `difficulty` VARCHAR(20) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wrong_answers_childId_idx`(`childId`),
    INDEX `wrong_answers_childId_subject_idx`(`childId`, `subject`),
    INDEX `wrong_answers_childId_topic_idx`(`childId`, `topic`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `practice_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `childId` VARCHAR(191) NOT NULL,
    `subject` ENUM('math', 'english', 'science', 'chinese', 'higher_chinese') NOT NULL,
    `sourceType` ENUM('active', 'resolved') NOT NULL DEFAULT 'active',
    `multiplier` INTEGER NOT NULL DEFAULT 2,
    `totalQuestions` INTEGER NOT NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `practice_session_sources` (
    `practiceSessionId` VARCHAR(191) NOT NULL,
    `wrongAnswerId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`practiceSessionId`, `wrongAnswerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `practice_questions` (
    `id` VARCHAR(191) NOT NULL,
    `practiceSessionId` VARCHAR(191) NOT NULL,
    `questionText` TEXT NOT NULL,
    `answer` TEXT NOT NULL,
    `topic` VARCHAR(100) NULL,
    `difficulty` VARCHAR(20) NULL,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `token_balances` ADD CONSTRAINT `token_balances_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `parents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `token_transactions` ADD CONSTRAINT `token_transactions_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `parents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `children` ADD CONSTRAINT `children_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `parents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_childId_fkey` FOREIGN KEY (`childId`) REFERENCES `children`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_images` ADD CONSTRAINT `submission_images_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_responses` ADD CONSTRAINT `ai_responses_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wrong_answers` ADD CONSTRAINT `wrong_answers_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wrong_answers` ADD CONSTRAINT `wrong_answers_childId_fkey` FOREIGN KEY (`childId`) REFERENCES `children`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_sessions` ADD CONSTRAINT `practice_sessions_childId_fkey` FOREIGN KEY (`childId`) REFERENCES `children`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_session_sources` ADD CONSTRAINT `practice_session_sources_practiceSessionId_fkey` FOREIGN KEY (`practiceSessionId`) REFERENCES `practice_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_session_sources` ADD CONSTRAINT `practice_session_sources_wrongAnswerId_fkey` FOREIGN KEY (`wrongAnswerId`) REFERENCES `wrong_answers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_questions` ADD CONSTRAINT `practice_questions_practiceSessionId_fkey` FOREIGN KEY (`practiceSessionId`) REFERENCES `practice_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
