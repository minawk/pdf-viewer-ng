import { expect, Page, test } from '@playwright/test';

const pageInput = (page: Page) => page.getByRole('textbox', { name: 'Page number' });
const documentRegion = (page: Page) => page.getByRole('region', { name: 'PDF document' });
const status = (page: Page) => page.locator('pdfv-viewer [role="status"]');
const boundPage = (page: Page) => page.locator('output');

async function open(page: Page, mode: 'continuous' | 'single' = 'continuous') {
  await page.goto('/');
  if (mode === 'single') {
    await page.getByLabel('Page mode').selectOption('single');
  }
  await expect(page.locator('pdfv-page canvas').first()).toBeAttached({ timeout: 15_000 });
}

/** Waits until a native (smooth) scroll animation has finished. */
async function waitForScrollEnd(page: Page) {
  let previous = -1;
  await expect
    .poll(async () => {
      const current = await documentRegion(page).evaluate((el) => el.scrollTop);
      const settled = current === previous;
      previous = current;
      return settled;
    })
    .toBe(true);
}

/** Distance between the top of the viewport and the top of a page, in CSS pixels. */
function pageOffset(page: Page, pageNumber: number) {
  return page.evaluate((n) => {
    const view = document.querySelector('pdfv-document-view')!;
    const element = view.querySelector<HTMLElement>(`pdfv-page[data-page-number="${n}"]`)!;
    return element.getBoundingClientRect().top - view.getBoundingClientRect().top;
  }, pageNumber);
}

test.describe('continuous mode', () => {
  test('pager buttons navigate, scroll and announce', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: 'Previous page' })).toHaveAttribute('aria-disabled', 'true');

    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(pageInput(page)).toHaveValue('2');
    await expect(status(page)).toHaveText('Page 2 of 12');
    await expect.poll(() => pageOffset(page, 2)).toBeCloseTo(16, -1);

    await page.getByRole('button', { name: 'Last page' }).click();
    await expect(pageInput(page)).toHaveValue('12');
    await expect(page.getByRole('button', { name: 'Next page' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('pdfv-page[data-page-number="12"] canvas')).toBeAttached();

    await page.getByRole('button', { name: 'First page' }).click();
    await expect(pageInput(page)).toHaveValue('1');
    await expect(documentRegion(page)).toHaveJSProperty('scrollTop', 0);
  });

  test('keeps focus on a button that becomes disabled', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Last page' }).click();
    await page.getByRole('button', { name: 'Previous page' }).click();
    const next = page.getByRole('button', { name: 'Next page' });
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await expect(next).toBeFocused();
    // A click on the disabled button does nothing.
    await page.keyboard.press('Enter');
    await expect(pageInput(page)).toHaveValue('12');
  });

  test('page number field navigates and rejects invalid values', async ({ page }) => {
    await open(page);
    await pageInput(page).fill('7');
    await pageInput(page).press('Enter');
    await expect(boundPage(page)).toContainText('page 7');
    await expect.poll(() => pageOffset(page, 7)).toBeCloseTo(16, -1);

    for (const invalid of ['abc', '0', '13', '2.5']) {
      await pageInput(page).fill(invalid);
      await pageInput(page).press('Enter');
      await expect(pageInput(page)).toHaveValue('7');
    }

    await pageInput(page).fill('99');
    await pageInput(page).press('Escape');
    await expect(pageInput(page)).toHaveValue('7');
  });

  test('the current page follows scrolling', async ({ page }) => {
    await open(page);
    await documentRegion(page).evaluate((el) => {
      const target = el.querySelector<HTMLElement>('pdfv-page[data-page-number="4"]')!;
      el.scrollTop = target.offsetTop;
    });
    await expect(pageInput(page)).toHaveValue('4');
    await expect(boundPage(page)).toContainText('page 4');

    await documentRegion(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(pageInput(page)).toHaveValue('12');
  });

  test('[(page)] drives the viewer from the parent', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Go to page 5' }).click();
    await expect(pageInput(page)).toHaveValue('5');
    await expect.poll(() => pageOffset(page, 5)).toBeCloseTo(16, -1);
  });

  test('Home and End jump to the first and last pages', async ({ page }) => {
    await open(page);
    await documentRegion(page).focus();
    await page.keyboard.press('End');
    await expect(pageInput(page)).toHaveValue('12');
    await page.keyboard.press('Home');
    await expect(pageInput(page)).toHaveValue('1');
  });

  test('a new document opens at page 1', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Last page' }).click();
    await page.getByLabel('Document', { exact: true }).selectOption('samples/long.pdf');
    await expect(page.locator('pdfv-page')).toHaveCount(300, { timeout: 15_000 });
    await expect(pageInput(page)).toHaveValue('1');
    await expect(page.locator('pdfv-pager .page-total')).toHaveText('of 300');
  });
});

test.describe('single page mode', () => {
  test('shows one page at a time', async ({ page }) => {
    await open(page, 'single');
    await expect(page.locator('pdfv-page')).toHaveCount(1);
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.locator('pdfv-page')).toHaveCount(1);
    await expect(page.locator('pdfv-page')).toHaveAttribute('data-page-number', '2');
    await expect(page.getByRole('group', { name: 'Page 2 of 12' })).toBeVisible();
    await expect(page.locator('pdfv-page canvas')).toBeAttached();
  });

  test('arrow keys turn pages; page keys scroll a tall page before turning it', async ({ page }) => {
    await open(page, 'single');
    await documentRegion(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(pageInput(page)).toHaveValue('2');
    await page.keyboard.press('ArrowLeft');
    await expect(pageInput(page)).toHaveValue('1');

    // Fit to width makes the page taller than the viewport: PageDown scrolls first.
    await page.keyboard.press('PageDown');
    await expect(pageInput(page)).toHaveValue('1');
    await expect.poll(() => documentRegion(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await waitForScrollEnd(page);

    await documentRegion(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.keyboard.press('PageDown');
    await expect(pageInput(page)).toHaveValue('2');
    await expect(documentRegion(page)).toHaveJSProperty('scrollTop', 0);

    // PageUp at the top goes back to the end of the previous page.
    await page.keyboard.press('PageUp');
    await expect(pageInput(page)).toHaveValue('1');
    await expect
      .poll(() => documentRegion(page).evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1))
      .toBe(true);
  });

  test('switching modes keeps the current page', async ({ page }) => {
    await open(page, 'single');
    await pageInput(page).fill('6');
    await pageInput(page).press('Enter');
    await page.getByLabel('Page mode').selectOption('continuous');
    await expect(page.locator('pdfv-page')).toHaveCount(12);
    await expect(pageInput(page)).toHaveValue('6');
    await expect.poll(() => pageOffset(page, 6)).toBeCloseTo(16, -1);
  });
});
