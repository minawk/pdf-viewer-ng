import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const themes = ['light', 'dark', 'high-contrast', 'material', 'ocean'];

for (const theme of themes) {
  test(`demo has no axe violations with the "${theme}" theme`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Theme').selectOption(theme);
    await expect(page.locator('pdfv-viewer')).toHaveAttribute('data-pdfv-theme', theme);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('applies theme tokens through the cascade layers', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (msg) => msg.type() === 'warning' && warnings.push(msg.text()));
  await page.goto('/');
  const viewer = page.locator('pdfv-viewer');
  const token = (name: string) =>
    viewer.evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

  expect(await token('--pdfv-color-primary')).toBe('#0b57d0');
  await page.getByLabel('Theme').selectOption('dark');
  expect(await token('--pdfv-color-primary')).toBe('#8ab4f8');
  await page.getByLabel('Theme').selectOption('ocean');
  expect(await token('--pdfv-color-primary')).toBe('#006782');
  expect(await token('--pdfv-theme')).toBe('ocean');
  expect(warnings.filter((w) => w.includes('pdf-viewer-ng'))).toEqual([]);
});

test('skips the fully disabled toolbar when no document is loaded', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Theme').focus();
  await page.keyboard.press('Tab');
  // No document yet: every toolbar control is disabled, so focus goes straight to the document region.
  await expect(page.getByRole('region', { name: 'PDF document' })).toBeFocused();
});
