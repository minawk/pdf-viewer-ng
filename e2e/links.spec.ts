import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

const firstPage = (page: Page) => page.locator('pdfv-page[data-page-number="1"]');
const pageInput = (page: Page) => page.getByRole('textbox', { name: 'Page number' });

async function openLinks(page: Page) {
  await page.goto('/');
  await page.getByLabel('Document', { exact: true }).selectOption('samples/links.pdf');
  await expect(firstPage(page).locator('pdfv-link-layer a')).toHaveCount(4, { timeout: 15_000 });
}

test('web links open in a new tab, safely, named after their text', async ({ page }) => {
  await openLinks(page);
  const link = page.getByRole('link', { name: 'Project on GitHub (opens in a new tab)' });
  await expect(link).toHaveAttribute('href', 'https://github.com/minawk/pdf-viewer-ng');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

test('email links hand over to the mail application, in the same tab', async ({ page }) => {
  await openLinks(page);
  const link = page.getByRole('link', { name: 'Write to hello@example.com' });
  await expect(link).toHaveAttribute('href', 'mailto:hello@example.com');
  await expect(link).not.toHaveAttribute('target', /.*/);
});

test('unsafe links (javascript:) are not rendered', async ({ page }) => {
  await openLinks(page);
  await expect(page.locator('pdfv-link-layer a[href^="javascript"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /unsafe script/ })).toHaveCount(0);
});

test('a link to a page of the document navigates there', async ({ page }) => {
  await openLinks(page);
  await page.getByRole('link', { name: 'Chapter 2: a link to a page' }).click();
  await expect(pageInput(page)).toHaveValue('2');
  await expect(page.locator('pdfv-viewer [role="status"]')).toHaveText('Page 2 of 3');

  await page
    .locator('pdfv-page[data-page-number="2"]')
    .getByRole('link', { name: 'Back to the contents' })
    .click();
  await expect(pageInput(page)).toHaveValue('1');
});

test('a link to a named destination navigates there, from the keyboard too', async ({ page }) => {
  await openLinks(page);
  const link = page.getByRole('link', { name: 'Chapter 3: a link to a named destination' });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(pageInput(page)).toHaveValue('3');
});

test('a click on a web link opens it in a new tab', async ({ page, context }) => {
  await openLinks(page);
  // Answer locally instead of reaching the real site.
  await context.route('https://github.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>GitHub</title>' }),
  );
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: /Project on GitHub/ }).click(),
  ]);
  await expect(popup).toHaveURL('https://github.com/minawk/pdf-viewer-ng');
  await expect(pageInput(page)).toHaveValue('1');
});

test('links have no axe violations', async ({ page }) => {
  await openLinks(page);
  await page.getByRole('link', { name: /Project on GitHub/ }).focus();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(results.violations).toEqual([]);
});
