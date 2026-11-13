import { expect, test } from '@playwright/test';

const readerPath = 'read/demo/demo.chapter-1';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Кошка в парке' })).toBeVisible();
});

test('catalog, chapter navigation, direct sentence hash, and reading progress survive reload', async ({ page }) => {
  await page.getByRole('link', { name: 'Кошка в парке' }).first().click();
  await expect(page).toHaveURL(/#\/book\/demo$/);
  await expect(page.getByRole('link', { name: /Встреча в парке/ })).toBeVisible();
  await page.getByRole('link', { name: /Встреча в парке/ }).click();
  await expect(page).toHaveURL(/#\/read\/demo\/demo\.chapter-1/);
  await expect(page.getByRole('button', { name: /朝、私は公園へ行きます/ })).toBeVisible();
  await page.getByRole('button', { name: /朝、私は公園へ行きます/ }).click();
  await page.getByRole('button', { name: 'Далее' }).click();
  await expect(page).toHaveURL(/#\/read\/demo\/demo\.chapter-1/);
  await expect(page.locator('[id="sentence-demo.s2"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[id="sentence-demo.s2"]')).toHaveClass(/sentence-active/);
  await page.goto(`./#/${readerPath}?sentence=demo.s3`);
  await expect(page.locator('[id="sentence-demo.s3"]')).toHaveClass(/sentence-active/);
});

test('reader modes render distinct analysis behavior and preference survives reload', async ({ page }) => {
  await page.goto(`./#/${readerPath}`);
  const first = page.locator('[id="sentence-demo.s1"]');
  const second = page.locator('[id="sentence-demo.s2"]');
  await expect(first.getByRole('button', { name: /朝、私は公園へ行きます/ })).toBeVisible();
  await expect(first.locator('.analysis-expanded')).toBeVisible();
  await first.getByRole('button', { name: /朝、私は公園へ行きます/ }).click();
  await expect(first.locator('.analysis-expanded')).toBeVisible();
  await expect(second.locator('.analysis-expanded')).toBeVisible();

  await page.goto('./#/settings');
  const continuousMode = page.getByTestId('mode-select').getByRole('button', { name: 'Непрерывный' });
  await continuousMode.click();
  await expect(continuousMode).toHaveClass(/active/);
  await page.getByTestId('layer-furigana').click();
  await expect(page.getByTestId('layer-furigana')).not.toBeChecked();
  await page.goto(`./#/${readerPath}`);
  await expect(page.locator('[id="sentence-demo.s1"] .analysis-expanded')).toHaveCount(0);
  await expect(page.locator('[id="sentence-demo.s2"] .analysis-expanded')).toHaveCount(0);
  await second.getByRole('button', { name: /公園に小さな猫がいます/ }).click();
  await expect(page.locator('[id="sentence-demo.s2"] .analysis-expanded')).toBeVisible();
  await expect(page.locator('[id="sentence-demo.s2"]')).toHaveClass(/continuous-sentence/);
  await expect(page.locator('[id="sentence-demo.s1"] .analysis-expanded')).toHaveCount(0);
  await expect(page.locator('[id="sentence-demo.s1"] ruby')).toHaveCount(0);

  await page.goto('./#/settings');
  await page.getByTestId('mode-select').getByRole('button', { name: 'Адаптивный' }).click();
  await page.goto(`./#/${readerPath}`);
  await expect(page.locator('.adaptive-banner')).toBeVisible();
  await expect(page.locator('[id="sentence-demo.s1"] .analysis-expanded')).toBeVisible();
  await page.locator('[id="sentence-demo.s1"] .sentence-text').click();
  await expect(page.locator('[id="sentence-demo.s1"] .analysis-expanded')).toBeVisible();
});

test('dictionary word occurrence navigates back to its source sentence', async ({ page }) => {
  await page.goto('./#/words/neko');
  await expect(page.getByRole('heading', { name: '猫' })).toBeVisible();
  const occurrence = page.getByRole('link', { name: /公園に小さな猫がいます/ });
  await expect(occurrence).toBeVisible();
  await occurrence.click();
  await expect(page).toHaveURL(/#\/read\/demo\/demo\.chapter-1\?sentence=demo\.s2/);
  await expect(page.locator('[id="sentence-demo.s2"]')).toHaveClass(/sentence-active/);
});

test('reader details return to the sentence and canvas settings control examples', async ({ page }) => {
  await page.goto(`./#/${readerPath}`);
  const first = page.locator('[id="sentence-demo.s1"]');
  await first.locator('.token-list button').first().click();
  await expect(page).toHaveURL(/#\/words\/asa\?returnTo=/);
  await page.getByRole('link', { name: 'Вернуться к чтению' }).click();
  await expect(first).toHaveClass(/sentence-active/);

  await page.goto('./#/settings');
  await page.getByText('Режим полотна').click();
  await expect(page.getByRole('checkbox', { name: 'Режим полотна' })).toBeChecked();
  await page.getByText('Хирагана', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Хирагана', exact: true })).toBeChecked();
  await page.getByText('Хирагана · отдельной строкой').click();
  await expect(page.getByRole('checkbox', { name: 'Хирагана · отдельной строкой' })).toBeChecked();
  await page.getByText('Буквально · отдельной строкой').click();
  await expect(page.getByRole('checkbox', { name: 'Буквально · отдельной строкой' })).toBeChecked();
  await page.goto(`./#/${readerPath}`);
  await expect(first.locator('.canvas-card').first()).toBeVisible();
  await expect(first.locator('.translation-row > p[lang="ja"]').first()).toHaveClass(/translation-line/);
  await expect(first.locator('.translation-row p:has([aria-label="Буквально"])').first()).toHaveClass(/translation-line/);

  await page.goto('./#/grammar/grammar.topic');
  await expect(page.locator('.grammar-example').first().locator('[aria-label="Хирагана"]')).toBeVisible();
  await expect(page.locator('.grammar-example').first().locator('[aria-label="Буквально"]')).toBeVisible();
});

test('quiz answer can be rated and appears in review history', async ({ page }) => {
  await page.goto('./#/reviews');
  await page.getByRole('button', { name: /Все/ }).click();
  await expect(page.locator('.review-stage')).toBeVisible();
  const prompt = (await page.locator('.review-prompt').textContent())?.trim();
  if (!prompt) {
    throw new Error('Review prompt was empty');
  }
  const answer = page.locator('.answer-option').filter({ hasText: 'кошка' });
  if (prompt === '猫') {
    await answer.click();
  } else {
    await page.locator('.answer-option').first().click();
  }
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.getByRole('button', { name: prompt === '猫' ? 'Хорошо' : 'Снова' }).click();
  await page.goto('./#/statistics');
  await expect(page.getByText('История повторений')).toBeVisible();
  await expect(page.locator('.history-row')).toHaveCount(1);
});

test('backup export downloads valid guest operations without authenticating', async ({ page }) => {
  await page.goto('./#/account');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать резервную копию' }).click();
  const file = await download;
  const stream = await file.createReadStream();
  expect(stream).not.toBeNull();
  let text = '';
  for await (const chunk of stream!) {
    text += chunk.toString();
  }
  const backup = JSON.parse(text) as { version: number; operations: unknown[] };
  expect(backup.version).toBe(1);
  expect(Array.isArray(backup.operations)).toBe(true);
});

test('backup import validates and restores a well-formed copy', async ({ page }) => {
  await page.goto('./#/settings');
  const backup = {
    version: 1,
    operations: [
      {
        id: 'e2e-import-operation',
        ownerId: 'guest',
        deviceId: 'e2e-device',
        entityKind: 'favorite',
        entityId: 'demo',
        payload: { active: true },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
  await page.getByLabel('Импортировать копию').setInputFiles({
    name: 'readfold-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByText('Данные импортированы.')).toBeVisible();
  await page.goto('./#/library');
  await page.getByRole('button', { name: 'Избранное', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Кошка в парке' }).first()).toBeVisible();
});

test('mobile navigation opens, reaches library, and stays within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Библиотека' }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Библиотека' }).click();
  await expect(page.getByRole('heading', { name: 'Библиотека' })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});

test('service worker serves shell and previously loaded chapter while offline', async ({ page, context }) => {
  await page.goto(`./#/${readerPath}`);
  await expect(page.getByRole('button', { name: /朝、私は公園へ行きます/ })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /朝、私は公園へ行きます/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Кошка в парке' })).toBeVisible();
  await page.locator('[id="sentence-demo.s2"] .sentence-text').click();
  await expect(page.locator('[id="sentence-demo.s2"]')).toHaveClass(/sentence-active/);
  await page.reload();
  await expect(page.locator('[id="sentence-demo.s2"]')).toHaveClass(/sentence-active/);
  await page.goto('./privacy.html');
  await expect(page.getByRole('heading', { name: 'ReadFold Privacy Policy', exact: true })).toBeVisible();
  await page.goto('./terms.html');
  await expect(page.getByRole('heading', { name: 'ReadFold Terms of Service', exact: true })).toBeVisible();
});

test('adaptive hints for known words can always be revealed manually', async ({ page }) => {
  await page.goto('./#/settings');
  const ids = ['asa', 'watashi', 'wa', 'kouen', 'e', 'iku'];
  const backup = {
    version: 1,
    operations: ids.map((id, index) => ({
      id: `known-${index}`,
      ownerId: 'guest',
      deviceId: 'test',
      entityKind: 'learning',
      entityId: id,
      payload: { status: 'known' },
      createdAt: '2026-01-01T00:00:00Z',
    })),
  };
  await page
    .getByLabel('Импортировать копию')
    .setInputFiles({ name: 'known.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByText('Данные импортированы.')).toBeVisible();
  const adaptive = page.getByTestId('mode-select').getByRole('button', { name: 'Адаптивный' });
  await adaptive.click();
  await expect(adaptive).toHaveClass(/active/);
  await page.goto(`./#/${readerPath}`);
  const first = page.locator('[id="sentence-demo.s1"]');
  await expect(first.getByRole('button', { name: 'Показать разбор' })).toBeVisible();
  await expect(first.locator('.analysis-expanded')).toHaveCount(0);
  await first.getByRole('button', { name: 'Показать разбор' }).click();
  await expect(first.locator('.analysis-expanded')).toBeVisible();
});
