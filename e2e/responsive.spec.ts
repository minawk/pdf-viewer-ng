import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

const more = (page: Page) => page.getByRole('button', { name: 'More tools' });
const menu = (page: Page) => page.getByRole('menu', { name: 'More tools' });

async function openAt(page: Page, width: number) {
  await page.setViewportSize({ width, height: 760 });
  await page.goto('/');
  await expect(page.locator('pdfv-text-layer span').first()).toBeAttached({ timeout: 15_000 });
}

test('wide viewers show every tool, without menu', async ({ page }) => {
  await openAt(page, 1100);
  await expect(more(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
});

test('narrow viewers move secondary tools into the "More tools" menu', async ({ page }) => {
  await openAt(page, 390);
  await expect(page.getByRole('button', { name: 'Print' })).toHaveCount(0);
  await expect(more(page)).toHaveAttribute('aria-haspopup', 'menu');
  await more(page).click();
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('menuitemradio')).toHaveText([/^Select text/, 'Pan']);
  await expect(menu(page).getByRole('menuitemcheckbox')).toHaveText(['Highlight', 'Add text']);
  await expect(menu(page).getByRole('menuitem')).toHaveText([
    'First page',
    'Last page',
    'Open file',
    'Download',
    'Print',
  ]);
  await expect(menu(page).getByRole('menuitemradio', { name: 'Select text' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('the menu works with the keyboard', async ({ page }) => {
  await openAt(page, 390);
  await more(page).focus();
  await page.keyboard.press('ArrowDown');
  await expect(menu(page).getByRole('menuitem', { name: 'First page' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu(page).getByRole('menuitem', { name: 'Print' })).toBeFocused();
  await page.keyboard.press('Home');
  // First page, Last page, Select text, Pan.
  for (let step = 0; step < 3; step++) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(menu(page).getByRole('menuitemradio', { name: 'Pan' })).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(menu(page)).toHaveCount(0);
  await expect(more(page)).toBeFocused();
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('pdfv-document-view.pan')).toHaveCount(1);

  await page.keyboard.press('ArrowUp'); // opens on the last item
  await expect(menu(page).getByRole('menuitem', { name: 'Print' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(more(page)).toBeFocused();
});

test('a press outside closes the menu', async ({ page }) => {
  await openAt(page, 390);
  await more(page).click();
  await expect(menu(page)).toBeVisible();
  await page.getByRole('heading', { name: 'pdf-viewer-ng' }).click();
  await expect(menu(page)).toHaveCount(0);
});

test('menu actions run like the toolbar buttons', async ({ page }) => {
  await openAt(page, 390);
  await more(page).focus();
  await page.keyboard.press('ArrowDown');
  // "Add text" from the keyboard writes a note right away.
  await menu(page).getByRole('menuitemcheckbox', { name: 'Add text' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Text note' })).toBeFocused();
});

test('reflows at 320 CSS pixels without horizontal scrolling (WCAG 1.4.10)', async ({ page }) => {
  await openAt(page, 320);
  await expect(more(page)).toBeVisible(); // compact layout applied (set once the viewer is measured)
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    toolbar: (() => {
      const toolbar = document.querySelector('pdfv-toolbar')!;
      return toolbar.scrollWidth - toolbar.clientWidth;
    })(),
  }));
  expect(overflow).toEqual({ page: 0, toolbar: 0 });
});

test('the compact toolbar and its menu have no axe violations', async ({ page }) => {
  await openAt(page, 390);
  for (const theme of ['dark', 'high-contrast']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    if ((await more(page).getAttribute('aria-expanded')) !== 'true') {
      await more(page).click();
    }
    await expect(menu(page)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(results.violations, theme).toEqual([]);
  }
});

test('the compact toolbar fits on one row on a phone, with shorter fields', async ({ page }) => {
  await openAt(page, 486);
  await expect(more(page)).toBeVisible();
  // First and last page are in the menu.
  await expect(page.getByRole('button', { name: 'First page' })).toHaveCount(0);
  const toolbar = page.getByRole('toolbar', { name: 'PDF viewer toolbar' });
  const box = (await toolbar.boundingBox())!;
  expect(box.height).toBeLessThan(48);
  const field = (await page.getByRole('textbox', { name: 'Zoom level' }).boundingBox())!;
  expect(field.height).toBe(28);
  const button = (await page.getByRole('button', { name: 'Zoom in' }).boundingBox())!;
  expect(button.height).toBeGreaterThanOrEqual(24); // WCAG 2.2 target size (AA)
});

test('the reading position follows a resize (phone rotation)', async ({ page }) => {
  await openAt(page, 360);
  await page.setViewportSize({ width: 800, height: 700 });
  const view = page.locator('pdfv-document-view');
  await expect
    .poll(() =>
      view.evaluate((el) => {
        const first = el.querySelector('pdfv-page')!.getBoundingClientRect();
        return Math.round(first.left - el.getBoundingClientRect().left);
      }),
    )
    .toBe(16);
  expect(await view.evaluate((el) => el.scrollLeft)).toBe(0);
});
