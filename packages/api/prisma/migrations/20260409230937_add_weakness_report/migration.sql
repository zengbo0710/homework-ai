-- CreateTable
CREATE TABLE `weakness_reports` (
    `id` VARCHAR(191) NOT NULL,
    `childId` VARCHAR(191) NOT NULL,
    `subject` ENUM('math', 'english', 'science', 'chinese', 'higher_chinese') NOT NULL,
    `sourceWrongIds` JSON NOT NULL,
    `topicGroups` JSON NOT NULL,
    `weaknesses` JSON NOT NULL,
    `summary` TEXT NOT NULL,
    `totalQuestions` INTEGER NOT NULL,
    `totalTopics` INTEGER NOT NULL,
    `modelUsed` VARCHAR(50) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `weakness_reports_childId_subject_idx`(`childId`, `subject`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `weakness_reports` ADD CONSTRAINT `weakness_reports_childId_fkey` FOREIGN KEY (`childId`) REFERENCES `children`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
