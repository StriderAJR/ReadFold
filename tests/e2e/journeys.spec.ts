import { expect, test } from '@playwright/test';

const readerPath = 'read/apothecary-diaries/apothecary-diaries.chapter-1';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Монолог фармацевта' })).toBeVisible();
});

test('kanji share visual parts through kanji cards and parts remain available offline', async ({ page, context }) => {
  await page.goto('./#/kanji/ja%3Akanji%3A想');
  const componentLink = page.locator('a[href*="/kanji/ja%3Akanji%3A心"]');
  await expect(componentLink).toBeVisible();
  await componentLink.click();
  await expect(page).toHaveURL(/\/kanji\/ja%3Akanji%3A心/);
  await expect(page.locator('.kanji-mnemonic')).toBeVisible();
  await page.goto('./#/components?q=丆');
  const partOnlyLink = page.locator('a[href*="/components/ja%3Akanji%3A丆"]');
  await expect(partOnlyLink).toBeVisible();
  await partOnlyLink.click();
  await expect(page.locator('.visual-component-card')).toBeVisible();
  await expect(page.locator('.visual-component-card .kanji-mnemonic-phrase')).not.toBeEmpty();
  await expect(page.locator('.kanji-readings')).toHaveCount(0);
  await page.goto('./#/components?q=木');
  await expect(page.locator('a[href*="/components/ja%3Akanji%3A木"]')).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('a[href*="/components/ja%3Akanji%3A木"]')).toBeVisible();
});

test('catalog, chapter navigation, direct sentence hash, and reading progress survive reload', async ({ page }) => {
  await page.getByRole('link', { name: 'Монолог фармацевта' }).first().click();
  await expect(page).toHaveURL(/#\/book\/apothecary-diaries$/);
  await expect(page.getByRole('link', { name: /１\u3000猫猫/ })).toBeVisible();
  await page.getByRole('link', { name: /１\u3000猫猫/ }).click();
  await expect(page).toHaveURL(/#\/read\/apothecary-diaries\/apothecary-diaries\.chapter-1/);
  await expect(page.getByRole('button', { name: /（露天の串焼きが食べたいなあ）/ })).toBeVisible();
  await page.getByRole('button', { name: /（露天の串焼きが食べたいなあ）/ }).click();
  await page.getByRole('button', { name: 'Далее' }).click();
  await expect(page).toHaveURL(/#\/read\/apothecary-diaries\/apothecary-diaries\.chapter-1/);
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s002"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s002"]')).toHaveClass(/sentence-active/);
  await page.goto(`./#/${readerPath}?sentence=apothecary-diaries.chapter-1.s003`);
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s003"]')).toHaveClass(/sentence-active/);
});

test('reader modes render distinct analysis behavior and preference survives reload', async ({ page }) => {
  await page.goto(`./#/${readerPath}`);
  const first = page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"]');
  const second = page.locator('[id="sentence-apothecary-diaries.chapter-1.s002"]');
  await expect(first.getByRole('button', { name: /（露天の串焼きが食べたいなあ）/ })).toBeVisible();
  await expect(first.locator('.analysis-expanded')).toBeVisible();
  await first.getByRole('button', { name: /（露天の串焼きが食べたいなあ）/ }).click();
  await expect(first.locator('.analysis-expanded')).toBeVisible();
  await expect(second.locator('.analysis-expanded')).toBeVisible();

  await page.goto('./#/settings');
  const continuousMode = page.getByTestId('mode-select').getByRole('button', { name: 'Непрерывный' });
  await continuousMode.click();
  await expect(continuousMode).toHaveClass(/active/);
  await page.getByTestId('layer-furigana').click();
  await expect(page.getByTestId('layer-furigana')).not.toBeChecked();
  await page.goto(`./#/${readerPath}`);
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"] .analysis-expanded')).toHaveCount(0);
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s002"] .analysis-expanded')).toHaveCount(0);
  await second.getByRole('button', { name: /曇天を見上げて猫猫/ }).click();
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s002"] .analysis-expanded')).toBeVisible();
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s002"]')).toHaveClass(/continuous-sentence/);
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"] .analysis-expanded')).toHaveCount(0);
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"] ruby')).toHaveCount(0);

  await page.goto('./#/settings');
  await page.getByTestId('mode-select').getByRole('button', { name: 'Адаптивный' }).click();
  await page.goto(`./#/${readerPath}`);
  await expect(page.locator('.adaptive-banner')).toBeVisible();
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"] .analysis-expanded')).toBeVisible();
  await page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"] .sentence-text').click();
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"] .analysis-expanded')).toBeVisible();
});

test('dictionary word occurrence navigates back to its source sentence', async ({ page }) => {
  await page.goto('./#/words/ja%3Aword%3A%E9%9C%B2%E5%A4%A9');
  await expect(page.getByRole('heading', { name: '露天' })).toBeVisible();
  const occurrence = page.getByRole('link', { name: /露天の串焼き/ });
  await expect(occurrence).toBeVisible();
  await occurrence.click();
  await expect(page).toHaveURL(/#\/read\/apothecary-diaries\/apothecary-diaries\.chapter-1\?sentence=apothecary-diaries\.chapter-1\.s001/);
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"]')).toHaveClass(/sentence-active/);
});

test('grammar card adds the current book sentence and contextual role', async ({ page }) => {
  await page.goto('./#/read/apothecary-diaries/apothecary-diaries.chapter-1');
  const sentence = page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"]');
  await sentence.locator('[data-entity-id="ja:grammar:possession"] .text-link').click();
  await expect(page).toHaveURL(/#\/grammar\/ja%3Agrammar%3Apossession\?returnTo=/);
  const bookExample = page.locator('.in-book-grammar-example');
  await expect(bookExample.getByRole('heading', { name: 'Пример из этой книги' })).toBeVisible();
  await expect(bookExample).toContainText('частица の уточняет, откуда шашлычки');
});

test('reader details return to the sentence and canvas settings control examples', async ({ page }) => {
  await page.goto(`./#/${readerPath}`);
  const first = page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"]');
  await first.locator('.token-word-link').first().click();
  await expect(page).toHaveURL(/#\/words\/ja%3Aword%3A%E9%9C%B2%E5%A4%A9\?returnTo=/);
  await page.getByRole('link', { name: 'Вернуться к чтению' }).click();
  await expect(first).toHaveClass(/sentence-active/);

  await page.goto('./#/settings');
  await page.getByText('Режим полотна').click();
  await expect(page.getByRole('checkbox', { name: 'Режим полотна' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Хирагана', exact: true })).toHaveCount(0);
  await page.getByText('Фуригана · отдельной строкой').click();
  await expect(page.getByRole('checkbox', { name: 'Фуригана · отдельной строкой' })).toBeChecked();
  await page.getByText('Буквально · отдельной строкой').click();
  await expect(page.getByRole('checkbox', { name: 'Буквально · отдельной строкой' })).toBeChecked();
  await page.goto(`./#/${readerPath}`);
  await expect(first.locator('.canvas-card').first()).toBeVisible();
  await expect(first.locator('.canvas-card-word').first().locator('ruby rt')).toHaveText('ろてん');
  await expect(first.locator('.translation-row > p[lang="ja"]').first()).toHaveClass(/translation-line/);
  await expect(first.locator('.translation-row p:has([aria-label="Буквально"])').first()).toHaveClass(/translation-line/);

  await page.goto('./#/grammar/ja%3Agrammar%3Apossession');
  await expect(page.locator('.grammar-example').first().locator('[aria-label="Фуригана"]')).toBeVisible();
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
  const answer = page.locator('.answer-option').filter({ hasText: 'уличная торговая палатка' });
  if (prompt === '露天') {
    await answer.click();
  } else {
    await page.locator('.answer-option').first().click();
  }
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.getByRole('button', { name: prompt === '露天' ? 'Хорошо' : 'Снова' }).click();
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
        entityId: 'apothecary-diaries',
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
  await expect(page.getByRole('link', { name: 'Монолог фармацевта' }).first()).toBeVisible();
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

test('reader settings stay within a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`./#/${readerPath}`);
  await page.locator('.layer-options summary').click();
  const menu = page.locator('.layer-options > div');
  const bounds = await menu.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  await menu.getByRole('checkbox', { name: 'Каждый перевод на отдельной строке' }).scrollIntoViewIfNeeded();
  await expect(menu.getByRole('checkbox', { name: 'Каждый перевод на отдельной строке' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await menu.getByRole('checkbox', { name: 'Каждый перевод на отдельной строке' }).click();
  await expect(page.locator('.layer-options')).toHaveAttribute('open', '');
  await page.locator('.reader-toolbar').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('.layer-options')).not.toHaveAttribute('open');
  await page.locator('.layer-options summary').click();
  await expect(page.locator('.layer-options')).toHaveAttribute('open', '');
});

test('service worker serves shell and previously loaded chapter while offline', async ({ page, context }) => {
  await page.goto(`./#/${readerPath}`);
  await expect(page.getByRole('button', { name: /（露天の串焼きが食べたいなあ）/ })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /（露天の串焼きが食べたいなあ）/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Монолог фармацевта' })).toBeVisible();
  await page.locator('[id="sentence-apothecary-diaries.chapter-1.s002"] .sentence-text').click();
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s002"]')).toHaveClass(/sentence-active/);
  await page.reload();
  await expect(page.locator('[id="sentence-apothecary-diaries.chapter-1.s002"]')).toHaveClass(/sentence-active/);
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
  const first = page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"]');
  await expect(first.locator('.analysis-expanded')).toBeVisible();
  await expect(first.locator('[data-entity-id="ja:word:露天"]')).toHaveCount(0);
  await first.getByTestId('show-known').click();
  await expect(first.locator('[data-entity-id="ja:word:露天"]')).toBeVisible();
  await expect(first.locator('.analysis-expanded')).toBeVisible();
});

test('known word, kanji, and grammar cards can be hidden adaptively and restored for undo', async ({ page }) => {
  await page.goto(`./#/${readerPath}`);
  const first = page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"]');
  const wordCard = first.locator('[data-entity-id="ja:word:露天"]');
  const kanjiCard = first.locator('[data-entity-id="ja:kanji:露"]');
  const grammarCard = first.locator('[data-entity-id="ja:grammar:possession"]');
  for (const card of [wordCard, kanjiCard, grammarCard]) {
    await card.getByTestId('learning-toggle').click();
    await expect(card.getByTestId('learning-toggle')).toHaveAttribute('aria-pressed', 'true');
  }

  await page.goto('./#/settings');
  await page.getByTestId('mode-select').getByRole('button', { name: 'Адаптивный' }).click();
  await page.goto(`./#/${readerPath}`);
  await expect(first.locator('[data-entity-id="ja:word:露天"]')).toHaveCount(0);
  await expect(first.locator('[data-entity-id="ja:kanji:露"]')).toHaveCount(0);
  await expect(first.locator('[data-entity-id="ja:grammar:possession"]')).toHaveCount(0);

  await first.getByTestId('show-known').click();
  for (const selector of ['ja:word:露天', 'ja:kanji:露', 'ja:grammar:possession']) {
    const card = first.locator(`[data-entity-id="${selector}"]`);
    await expect(card).toBeVisible();
    await card.getByTestId('learning-toggle').click();
    await expect(card.getByTestId('learning-toggle')).toHaveAttribute('aria-pressed', 'false');
  }
  await page.reload();
  await expect(first.locator('[data-entity-id="ja:word:露天"]')).toBeVisible();
  await expect(first.locator('[data-entity-id="ja:kanji:露"]')).toBeVisible();
  await expect(first.locator('[data-entity-id="ja:grammar:possession"]')).toBeVisible();
});

test('furigana toggle controls reading annotations without a separate hiragana layer', async ({ page }) => {
  await page.goto('./#/settings');
  const furigana = page.getByRole('checkbox', { name: 'Фуригана', exact: true });
  await expect(page.getByRole('checkbox', { name: 'Хирагана', exact: true })).toHaveCount(0);
  await furigana.click();
  await expect(furigana).not.toBeChecked();
  await page.goto(`./#/${readerPath}`);
  const first = page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"]');
  await expect(first.locator('ruby')).toHaveCount(0);
  await expect(first.locator('.token-word-card').first().locator('.word-card-meta')).not.toContainText('ろてん');

  await page.goto('./#/settings');
  await furigana.click();
  await expect(furigana).toBeChecked();
  await page.goto(`./#/${readerPath}`);
  await expect(first.locator('ruby').first()).toBeVisible();
  await expect(first.locator('.token-word-card').first().locator('.token-word-link ruby rt')).toHaveText('ろてん');
  await expect(first.locator('.token-word-card').first().locator('.word-card-meta')).not.toContainText('ろてん');

  await page.goto('./#/read/apothecary-diaries/apothecary-diaries.chapter-1');
  const inflectedWord = page.locator('[id="sentence-apothecary-diaries.chapter-1.s001"] [data-entity-id="ja:word:食べる"]');
  await expect(inflectedWord.locator('ruby')).toContainText('食');
  await expect(inflectedWord.locator('ruby rt')).toHaveText('た');
  await expect(inflectedWord).toContainText('べたい');
});

test('diagnostics report shares a local log file with support text', async ({ page }) => {
  await page.goto('./#/settings/diagnostics');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true });
    Object.defineProperty(navigator, 'share', {
      value: async (data: ShareData) => {
        const file = data.files?.[0];
        sessionStorage.setItem('sharedReport', file ? await file.text() : '');
        sessionStorage.setItem('sharedText', data.text ?? '');
      },
    });
  });
  await page.getByRole('button', { name: 'Сообщить разработчику' }).click();
  await expect(page.getByRole('status')).toContainText('Отчёт передан');
  const shared = await page.evaluate(() => ({
    report: JSON.parse(sessionStorage.getItem('sharedReport') ?? '{}') as Record<string, unknown>,
    text: sessionStorage.getItem('sharedText'),
  }));
  expect(shared.report.app).toBe('ReadFold');
  expect(shared.report.diagnostics).toEqual([]);
  expect(shared.text).toContain('readfold.app@gmail.com');
  expect(shared.text).toContain('Что произошло');
});

test('diagnostics report downloads its attachment when file sharing is unavailable', async ({ page }) => {
  await page.goto('./#/settings/diagnostics');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сообщить разработчику' }).click();
  const report = await downloadPromise;
  expect(report.suggestedFilename()).toBe('readfold-diagnostics.json');
  await expect(page.getByRole('status')).toContainText('Прикрепите его');
});
