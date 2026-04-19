-- AlterTable
ALTER TABLE `wrong_answers`
  ADD COLUMN `questionImageUrl` VARCHAR(500) NULL,
  ADD COLUMN `questionTextNormalized` VARCHAR(500) NOT NULL DEFAULT '';

-- Backfill existing rows with a best-effort normalized copy
UPDATE `wrong_answers`
SET `questionTextNormalized` = LOWER(TRIM(REGEXP_REPLACE(LEFT(`questionText`, 500), '[[:space:]]+', ' ')));

-- CreateIndex
CREATE INDEX `wrong_answers_childId_subject_questionTextNormalized_idx`
  ON `wrong_answers`(`childId`, `subject`, `questionTextNormalized`);
