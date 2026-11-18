import { expect, test } from '@playwright/test';

test.describe('document loading and rendering', () => {
  test('loads the sample document and announces it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('pdfv-page')).toHaveCount(12, { timeout: 15_000 });
    await expect(page.locator('pdfv-page').first().locator('canvas')).toBeAttached();
    await expect(page.locator('pdfv-viewer [role="status"]')).toHaveText('Document loaded, 12 pages.');
    await expect(page.locator('output')).toContainText('loaded: 12 pages');
    await expect(page.getByRole('group', { name: 'Page 1 of 12' })).toBeVisible();
  });

  test('sizes each page from its own dimensions', async ({ page }) => {
    await page.goto('/');
    const size = (n: number) =>
      page.locator(`pdfv-page[data-page-number="${n}"]`).evaluate((el) => {
        const { width, height } = el.getBoundingClientRect();
        return width / height;
      });
    await expect.poll(() => size(5)).toBeCloseTo(792 / 612, 1); // landscape
    expect(await size(1)).toBeCloseTo(612 / 792, 1); // portrait letter
    expect(await size(9)).toBeCloseTo(420 / 595, 1); // A5
  });

  test('renders only the pages near the visible area', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Document', { exact: true }).selectOption('samples/long.pdf');
    await expect(page.locator('pdfv-page')).toHaveCount(300, { timeout: 15_000 });
    await expect(page.locator('pdfv-page canvas').first()).toBeAttached();
    expect(await page.locator('pdfv-page canvas').count()).toBeLessThanOrEqual(4);

    await page.locator('pdfv-document-view').evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
    await expect(page.locator('pdfv-page[data-page-number="1"] canvas')).toHaveCount(0);
    await expect(page.locator('pdfv-page[data-page-number="150"] canvas')).toBeAttached();
    expect(await page.locator('pdfv-page canvas').count()).toBeLessThanOrEqual(4);
  });

  test('shows an accessible error for an invalid file', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Document', { exact: true }).selectOption('samples/invalid.pdf');
    await expect(page.getByRole('alert')).toHaveText('This file is not a valid PDF document.');
    await expect(page.getByRole('alert').getByRole('button')).toHaveCount(0);
    await expect(page.locator('output')).toContainText('loadError: invalid');
  });

  test('offers a retry when the file cannot be downloaded', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Document', { exact: true }).selectOption('samples/missing.pdf');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('could not be found');
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(alert).toContainText('could not be found');
  });

  test('loads the pdf.js worker from the configured URL', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (request) => request.resourceType() === 'script' && scripts.push(request.url()));
    await page.goto('/');
    await expect(page.locator('pdfv-page canvas').first()).toBeAttached({ timeout: 15_000 });
    // The worker is fetched separately, from the configured asset URL.
    expect(scripts.some((url) => url.endsWith('/assets/pdfjs/pdf.worker.min.mjs'))).toBe(true);
  });
});
