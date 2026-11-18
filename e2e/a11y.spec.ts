import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

const themes = ['light', 'dark', 'high-contrast', 'material', 'ocean'];

async function waitForFirstPage(page: Page) {
  await expect(page.locator('pdfv-page').first().locator('canvas')).toBeAttached({ timeout: 15_000 });
}

function axe(page: Page) {
  return new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
    'best-practice',
  ]);
}

for (const theme of themes) {
  test(`loaded document has no axe violations with the "${theme}" theme`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await expect(page.locator('pdfv-viewer')).toHaveAttribute('data-pdfv-theme', theme);
    await waitForFirstPage(page);

    const results = await axe(page).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('error state has no axe violations', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Document', { exact: true }).selectOption('samples/missing.pdf');
  await expect(page.getByRole('alert')).toBeVisible();
  const results = await axe(page).analyze();
  expect(results.violations).toEqual([]);
});

test('applies theme tokens through the cascade layers', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (msg) => msg.type() === 'warning' && warnings.push(msg.text()));
  await page.goto('/');
  const viewer = page.locator('pdfv-viewer');
  const token = (name: string) =>
    viewer.evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

  expect(await token('--pdfv-color-primary')).toBe('#0b57d0');
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  expect(await token('--pdfv-color-primary')).toBe('#8ab4f8');
  await page.getByLabel('Theme', { exact: true }).selectOption('ocean');
  expect(await token('--pdfv-color-primary')).toBe('#006782');
  expect(await token('--pdfv-theme')).toBe('ocean');
  expect(warnings.filter((w) => w.includes('pdf-viewer-ng'))).toEqual([]);
});

test('toolbar is a single tab stop, followed by the document region', async ({ page }) => {
  await page.goto('/');
  await waitForFirstPage(page);
  await page.getByLabel('Theme', { exact: true }).focus();
  await page.keyboard.press('Tab');
  // On page 1, "first" and "previous" are disabled: the page number field is the first enabled item.
  await expect(page.getByRole('textbox', { name: 'Page number' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('region', { name: 'PDF document' })).toBeFocused();
});
