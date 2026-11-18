import { expect, Page, test } from '@playwright/test';

const firstPage = (page: Page) => page.locator('pdfv-page[data-page-number="1"]');
const textRun = (page: Page, text: string) => firstPage(page).locator('pdfv-text-layer span').filter({ hasText: text });

async function open(page: Page) {
  await page.goto('/');
  await expect(textRun(page, 'Chapter 1')).toBeAttached({ timeout: 15_000 });
}

/** Drags the mouse from the start of one text run to the end of another. */
async function dragSelect(page: Page, fromText: string, toText: string) {
  const from = (await textRun(page, fromText).boundingBox())!;
  const to = (await textRun(page, toText).boundingBox())!;
  await page.mouse.move(from.x + 1, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width - 1, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
}

test('exposes the page text to assistive technology, in the document language', async ({ page }) => {
  await open(page);
  const group = page.getByRole('group', { name: 'Page 1 of 12' });
  await expect(group).toContainText('Chapter 1');
  await expect(group).toContainText('A PDF viewer spends most of its time drawing pages.');
  await expect(firstPage(page).locator('pdfv-text-layer')).toHaveAttribute('lang', 'en');
  await expect(firstPage(page).locator('canvas')).toHaveAttribute('aria-hidden', 'true');
});

test('selects text with the mouse and copies it', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await dragSelect(page, 'A PDF viewer spends', 'the number of pages.');

  const selected = await page.evaluate(() => String(getSelection()));
  expect(selected).toContain('A PDF viewer spends most of its time drawing pages.');
  expect(selected).toContain('the number of pages.');

  await page.keyboard.press('Control+c');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('keeps memory stable whatever');
});

test('text runs stay aligned with the page when zooming', async ({ page }) => {
  await open(page);
  const relativeBox = async () => {
    const page1 = (await firstPage(page).boundingBox())!;
    const run = (await textRun(page, 'Chapter 1').boundingBox())!;
    return {
      x: (run.x - page1.x) / page1.width,
      y: (run.y - page1.y) / page1.height,
      width: run.width / page1.width,
    };
  };
  await page.getByRole('combobox', { name: 'Zoom level' }).selectOption('1');
  await expect.poll(async () => (await firstPage(page).boundingBox())!.width).toBeCloseTo(816, 0);
  const atActualSize = await relativeBox();

  await page.getByRole('combobox', { name: 'Zoom level' }).selectOption('2');
  await expect.poll(async () => (await firstPage(page).boundingBox())!.width).toBeCloseTo(1632, 0);
  await expect.poll(async () => (await relativeBox()).width).toBeCloseTo(atActualSize.width, 2);
  const atDouble = await relativeBox();
  expect(atDouble.x).toBeCloseTo(atActualSize.x, 2);
  expect(atDouble.y).toBeCloseTo(atActualSize.y, 2);
});

test('the pan tool does not select text', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Pan' }).click();
  await dragSelect(page, 'A PDF viewer spends', 'the number of pages.');
  expect(await page.evaluate(() => String(getSelection()))).toBe('');
});

test('only pages near the visible area have a text layer', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Document', { exact: true }).selectOption('samples/long.pdf');
  await expect(page.locator('pdfv-page')).toHaveCount(300, { timeout: 15_000 });
  await page.locator('pdfv-document-view').evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
  await expect(page.locator('pdfv-page[data-page-number="150"] pdfv-text-layer span').first()).toBeAttached();
  expect(await page.locator('pdfv-text-layer').count()).toBeLessThanOrEqual(4);
  await expect(page.locator('pdfv-page[data-page-number="1"] pdfv-text-layer')).toHaveCount(0);
});
