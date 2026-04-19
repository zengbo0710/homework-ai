import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const FIXTURE_DIR = path.resolve(__dirname, '..', 'test');
const MATH_PHOTO = path.join(FIXTURE_DIR, 'IMG_6893.jpg');
const SCIENCE_PHOTO_1 = path.join(FIXTURE_DIR, 'IMG_6896.jpg');
const SCIENCE_PHOTO_2 = path.join(FIXTURE_DIR, 'IMG_6897.jpg');

const hasFixtures = fs.existsSync(MATH_PHOTO) && fs.existsSync(SCIENCE_PHOTO_1) && fs.existsSync(SCIENCE_PHOTO_2);

test.describe('Scan flow (real OpenAI)', () => {
  test.skip(!hasFixtures, `Fixtures not found in ${FIXTURE_DIR}. Drop IMG_6893.jpg, IMG_6896.jpg, IMG_6897.jpg there.`);

  const email = `pw-${Date.now()}@example.com`;
  const password = 'Password123!';

  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/children/);

    // Add child
    await page.getByRole('link', { name: /add child/i }).click();
    await page.getByLabel('Name').fill('TestKid');
    await page.getByLabel(/grade/i).selectOption('3');
    await page.getByRole('button', { name: /save/i }).click();
    await page.getByRole('button', { name: /testkid/i }).click();
  });

  test('math single photo produces wrong-answers', async ({ page }) => {
    await page.getByRole('link', { name: /scan/i }).click();
    await page.setInputFiles('input[type="file"]', [MATH_PHOTO]);
    await page.getByRole('button', { name: /analyze|submit/i }).click();

    await expect(page.locator('text=/Needs attention|Wrong|Partial/i')).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/submissions\//);
  });

  test('science two photos produces multiple wrong-answers with figures', async ({ page }) => {
    await page.getByRole('link', { name: /scan/i }).click();
    await page.setInputFiles('input[type="file"]', [SCIENCE_PHOTO_1, SCIENCE_PHOTO_2]);
    await page.getByRole('button', { name: /analyze|submit/i }).click();

    await expect(page.locator('text=/Needs attention|Wrong|Partial/i')).toBeVisible({ timeout: 90_000 });
    // At least one cropped figure image should appear on the result page
    await expect(page.locator('img[alt="Figure"], img[src*="/uploads/submissions/"]').first()).toBeVisible();
  });
});
