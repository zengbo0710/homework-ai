-- DropIndex
DROP INDEX `wrong_answers_childId_subject_questionTextNormalized_idx` ON `wrong_answers`;

-- CreateIndex
CREATE UNIQUE INDEX `wrong_answers_unique_question` ON `wrong_answers`(`childId`, `subject`, `questionTextNormalized`);
