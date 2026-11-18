import { expect, Page, test } from '@playwright/test';

const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search in document' });
const counter = (page: Page) => page.locator('pdfv-search-bar .count');
const status = (page: Page) => page.locator('pdfv-viewer [role="status"]');
const current = (page: Page) => page.locator('pdfv-text-layer .highlight.selected');
const pageInput = (page: Page) => page.getByRole('textbox', { name: 'Page number' });

async function open(page: Page, document = 'samples/sample.pdf') {
  await page.goto('/');
  if (document !== 'samples/sample.pdf') {
    await page.getByLabel('Document', { exact: true }).selectOption(document);
  }
  await expect(page.locator('pdfv-text-layer span').first()).toBeAttached({ timeout: 15_000 });
}

async function searchFor(page: Page, query: string) {
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(searchBox(page)).toBeFocused();
  await searchBox(page).fill(query);
}

/** Whether the current result is entirely inside the visible document area. */
function currentIsVisible(page: Page) {
  return page.evaluate(() => {
    const element = document.querySelector('pdfv-text-layer .highlight.selected');
    const view = document.querySelector('pdfv-document-view')!.getBoundingClientRect();
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= view.top &&
      rect.bottom <= view.bottom &&
      rect.left >= view.left &&
      rect.right <= view.right
    );
  });
}

test('the search button opens the panel, Escape closes it and returns focus', async ({ page }) => {
  await open(page);
  const toggle = page.getByRole('button', { name: 'Search', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('search', { name: 'Search in document' })).toBeVisible();
  await expect(searchBox(page)).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('search')).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('Ctrl+F opens the viewer search instead of the browser one', async ({ page }) => {
  await open(page);
  await page.getByRole('region', { name: 'PDF document' }).focus();
  await page.keyboard.press('Control+f');
  await expect(searchBox(page)).toBeFocused();
});

test('finds, counts, highlights and announces results', async ({ page }) => {
  await open(page);
  await searchFor(page, 'signals');
  await expect(counter(page)).toHaveText('1 of 12');
  await expect(status(page)).toHaveText('12 results. Result 1 of 12');
  await expect(current(page)).toHaveText('Signals');
  await expect(searchBox(page)).toHaveAttribute('aria-describedby', /count/);
  expect(await currentIsVisible(page)).toBe(true);
});

test('Enter and Shift+Enter move between results, scrolling to them', async ({ page }) => {
  await open(page);
  await searchFor(page, 'signals');
  await expect(counter(page)).toHaveText('1 of 12');

  await searchBox(page).press('Enter');
  await expect(counter(page)).toHaveText('2 of 12');
  await expect(status(page)).toHaveText('Result 2 of 12');
  await expect(pageInput(page)).toHaveValue('2');
  await expect.poll(() => currentIsVisible(page)).toBe(true);

  await searchBox(page).press('Shift+Enter');
  await expect(counter(page)).toHaveText('1 of 12');
  // Wraps around backwards.
  await searchBox(page).press('Shift+Enter');
  await expect(counter(page)).toHaveText('12 of 12');
  await expect(pageInput(page)).toHaveValue('12');
  await expect.poll(() => currentIsVisible(page)).toBe(true);

  await page.getByRole('button', { name: 'Next result' }).click();
  await expect(counter(page)).toHaveText('1 of 12');
});

test('match case and whole words options', async ({ page }) => {
  await open(page);
  await searchFor(page, 'signal');
  await expect(counter(page)).toHaveText(/of 12$/);

  await page.getByRole('button', { name: 'Whole words' }).click();
  await expect(page.getByRole('button', { name: 'Whole words' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(counter(page)).toHaveText('No results');
  await expect(status(page)).toHaveText('No results');

  await page.getByRole('button', { name: 'Whole words' }).click();
  await page.getByRole('button', { name: 'Match case' }).click();
  await expect(counter(page)).toHaveText('No results'); // only "Signals" exists in the document
  await searchBox(page).fill('Signals');
  await expect(counter(page)).toHaveText('1 of 12');
});

test('finds phrases split over text runs and lines', async ({ page }) => {
  await open(page);
  await searchFor(page, 'drawing pages. Rendering');
  await expect(counter(page)).toHaveText(/^1 of \d+$/);
  await searchBox(page).fill('pages near the visible area');
  await expect(counter(page)).toHaveText(/^1 of \d+$/);
  // The match spans two lines: one highlight per line.
  await expect(page.locator('pdfv-text-layer .highlight.selected')).toHaveCount(2);
});

test('closing the search clears the highlights', async ({ page }) => {
  await open(page);
  await searchFor(page, 'signals');
  await expect(current(page)).toBeVisible();
  await page.getByRole('button', { name: 'Close search' }).click();
  await expect(page.locator('pdfv-text-layer .highlight')).toHaveCount(0);
});

test('searches a long document and reaches results on unrendered pages', async ({ page }) => {
  await open(page, 'samples/long.pdf');
  await searchFor(page, 'memory stable');
  await expect(counter(page)).toHaveText('1 of 300', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Previous result' }).click();
  await expect(counter(page)).toHaveText('300 of 300');
  await expect(pageInput(page)).toHaveValue('300');
  await expect(current(page)).toBeAttached();
  await expect.poll(() => currentIsVisible(page)).toBe(true);
});

test('works in single page mode', async ({ page }) => {
  await open(page);
  await page.getByLabel('Page mode').selectOption('single');
  await searchFor(page, 'signals');
  await expect(counter(page)).toHaveText('1 of 12');
  await searchBox(page).press('Enter');
  await expect(page.locator('pdfv-page')).toHaveAttribute('data-page-number', '2');
  await expect(current(page)).toHaveText('Signals');
});
