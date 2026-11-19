import { expect, Page, test } from '@playwright/test';

const zoomInput = (page: Page) => page.getByRole('textbox', { name: 'Zoom level' });
const documentRegion = (page: Page) => page.getByRole('region', { name: 'PDF document' });
const status = (page: Page) => page.locator('pdfv-viewer [role="status"]');

/** Types a zoom level, as a percentage, in the zoom field. */
async function setZoom(page: Page, percent: string) {
  await zoomInput(page).fill(percent);
  await zoomInput(page).press('Enter');
}
const pageWidth = (page: Page, n = 1) =>
  page
    .locator(`pdfv-page[data-page-number="${n}"]`)
    .evaluate((el) => el.getBoundingClientRect().width);

/** Position of a viewport point inside the page under it, as fractions of the page size. */
function pointInPage(page: Page, x: number, y: number) {
  return page.evaluate(
    ([x, y]) => {
      const element = document
        .elementsFromPoint(x, y)
        .find((e) => e.tagName === 'PDFV-PAGE') as HTMLElement;
      const rect = element.getBoundingClientRect();
      return {
        page: element.dataset['pageNumber'],
        x: (x - rect.left) / rect.width,
        y: (y - rect.top) / rect.height,
      };
    },
    [x, y],
  );
}

async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('pdfv-page canvas').first()).toBeAttached({ timeout: 15_000 });
}

// 612 pt letter page at 100% = 816 CSS px.
const ACTUAL_WIDTH = 816;

test('the default zoom is 125%', async ({ page }) => {
  await open(page);
  await expect(zoomInput(page)).toHaveValue('125%');
  // Page sizes are rounded down to whole pixels.
  await expect.poll(() => pageWidth(page)).toBeCloseTo(ACTUAL_WIDTH * 1.25, -1);
});

test('on narrow viewers, the default zoom fits the page width instead', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await open(page);
  const view = await documentRegion(page).evaluate((el) => el.clientWidth);
  await expect.poll(() => pageWidth(page)).toBeLessThanOrEqual(view);
  await expect(zoomInput(page)).toHaveValue(/^\d+%$/);
});

test('zoom buttons step through visible levels and announce them', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(status(page)).toHaveText(/^Zoom: \d+%$/);
  const zoomedIn = await pageWidth(page);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  expect(await pageWidth(page)).toBeLessThan(zoomedIn);
  await expect(page.locator('output')).toContainText(/zoom \d+%/);
});

test('a typed zoom level is applied, clamped, or reverted when invalid', async ({ page }) => {
  await open(page);
  await setZoom(page, '100');
  await expect.poll(() => pageWidth(page)).toBeCloseTo(ACTUAL_WIDTH, 0);
  await expect(status(page)).toHaveText('Zoom: 100%');
  await expect(zoomInput(page)).toHaveValue('100%');

  await setZoom(page, '900 %');
  await expect(zoomInput(page)).toHaveValue('400%');

  await setZoom(page, 'abc');
  await expect(zoomInput(page)).toHaveValue('400%');

  await zoomInput(page).fill('150');
  await zoomInput(page).press('Escape');
  await expect(zoomInput(page)).toHaveValue('400%');
});

test('arrow keys in the zoom field step through the levels', async ({ page }) => {
  await open(page);
  await setZoom(page, '100');
  await zoomInput(page).press('ArrowUp');
  await expect(zoomInput(page)).toHaveValue('125%');
  await zoomInput(page).press('ArrowDown');
  await zoomInput(page).press('ArrowDown');
  await expect(zoomInput(page)).toHaveValue('75%');
});

test('the fit button switches between fit to page and fit to width', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Fit to page' }).click();
  await expect(status(page)).toHaveText('Zoom: Fit to page');
  const viewHeight = await documentRegion(page).evaluate((el) => el.clientHeight);
  const pageHeight = await page
    .locator('pdfv-page[data-page-number="1"]')
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(pageHeight).toBeLessThanOrEqual(viewHeight);

  // The same button now offers the other fit, like in Chrome.
  const fitWidth = page.getByRole('button', { name: 'Fit to width' });
  await expect(fitWidth).toHaveAttribute('title', 'Fit to width');
  await fitWidth.click();
  await expect(status(page)).toHaveText('Zoom: Fit to width');
  const viewWidth = await documentRegion(page).evaluate((el) => el.clientWidth);
  await expect.poll(() => pageWidth(page)).toBeCloseTo(viewWidth - 32, -1);
  await expect(page.getByRole('button', { name: 'Fit to page' })).toBeVisible();
});

test('icon buttons show their name on hover', async ({ page }) => {
  await open(page);
  const buttons = page.getByRole('toolbar', { name: 'PDF viewer toolbar' }).getByRole('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(10);
  for (let index = 0; index < count; index++) {
    const button = buttons.nth(index);
    expect(await button.getAttribute('title')).toBe(await button.getAttribute('aria-label'));
  }
});

test('zoom in is disabled at the maximum, zoom out at the minimum', async ({ page }) => {
  await open(page);
  await setZoom(page, '400');
  await expect(page.getByRole('button', { name: 'Zoom in' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await setZoom(page, '10');
  await expect(page.getByRole('button', { name: 'Zoom out' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

async function ctrlWheel(page: Page, deltaY: number) {
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, deltaY);
  await page.keyboard.up('Control');
}

test('Ctrl + wheel keeps the point under the pointer in place', async ({ page }) => {
  await open(page);
  // Wider than the viewport, so both axes can be preserved.
  await setZoom(page, '200');
  await documentRegion(page).evaluate((el) =>
    el.scrollTo({ left: 200, top: 600, behavior: 'instant' }),
  );
  const box = (await documentRegion(page).boundingBox())!;
  const [x, y] = [box.x + 300, box.y + 250];
  await page.mouse.move(x, y);
  const before = await pointInPage(page, x, y);
  const widthBefore = await pageWidth(page);

  await ctrlWheel(page, -100);
  await expect.poll(() => pageWidth(page)).toBeGreaterThan(widthBefore * 1.1);
  const after = await pointInPage(page, x, y);
  expect(after.page).toBe(before.page);
  expect(after.x).toBeCloseTo(before.x, 2);
  expect(after.y).toBeCloseTo(before.y, 2);
  // The field shows the new level.
  await expect(zoomInput(page)).not.toHaveValue('200%');
  await expect(zoomInput(page)).toHaveValue(/^\d+%$/);
});

test('Ctrl + wheel keeps the vertical position while the page fits the width', async ({ page }) => {
  await open(page);
  await setZoom(page, '100');
  const box = (await documentRegion(page).boundingBox())!;
  const [x, y] = [box.x + 300, box.y + 250];
  await page.mouse.move(x, y);
  const before = await pointInPage(page, x, y);

  await ctrlWheel(page, -100);
  await expect.poll(() => pageWidth(page)).toBeGreaterThan(ACTUAL_WIDTH * 1.1);
  const after = await pointInPage(page, x, y);
  expect(after.page).toBe(before.page);
  expect(after.y).toBeCloseTo(before.y, 2);
});

test('keyboard shortcuts zoom instead of the browser', async ({ page }) => {
  await open(page);
  await documentRegion(page).focus();
  await page.keyboard.press('Control+=');
  await expect(status(page)).toHaveText(/^Zoom: \d+%$/);
  await page.keyboard.press('Control+0');
  // Back to the default zoom.
  await expect(zoomInput(page)).toHaveValue('125%');
  // The browser zoom is untouched.
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
});

test('two-finger pinch zooms on touch screens', async ({ page }) => {
  await open(page);
  await setZoom(page, '100');
  await documentRegion(page).evaluate(async (view) => {
    const rect = view.getBoundingClientRect();
    const [cx, cy] = [rect.left + 300, rect.top + 300];
    const touch = (id: number, x: number) =>
      new Touch({ identifier: id, target: view, clientX: x, clientY: cy });
    const send = (type: string, spread: number) =>
      view.dispatchEvent(
        new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [touch(1, cx - spread), touch(2, cx + spread)],
          cancelable: true,
          bubbles: true,
        }),
      );
    send('touchstart', 50);
    for (let spread = 55; spread <= 100; spread += 5) {
      send('touchmove', spread);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    send('touchend', 0);
  });
  await expect(zoomInput(page)).toHaveValue('200%');
});

test('fit to page follows the displayed page in single page mode', async ({ page }) => {
  await open(page);
  await page.getByLabel('Page mode').selectOption('single');
  await page.getByRole('button', { name: 'Fit to page' }).click();
  await page.getByRole('textbox', { name: 'Page number' }).fill('5');
  await page.getByRole('textbox', { name: 'Page number' }).press('Enter');
  const view = await documentRegion(page).evaluate((el) => ({
    width: el.clientWidth,
    height: el.clientHeight,
  }));
  await expect
    .poll(() => page.locator('pdfv-page').evaluate((el) => el.getBoundingClientRect().width))
    .toBeGreaterThan(
      await page.locator('pdfv-page').evaluate((el) => el.getBoundingClientRect().height),
    );
  const size = await page.locator('pdfv-page').evaluate((el) => el.getBoundingClientRect());
  expect(size.width).toBeLessThanOrEqual(view.width);
  expect(size.height).toBeLessThanOrEqual(view.height);
});

test('the pan tool drags the document without selecting text', async ({ page }) => {
  await open(page);
  await setZoom(page, '300');
  await page.getByRole('button', { name: 'Pan' }).click();
  await expect(page.getByRole('button', { name: 'Pan' })).toHaveAttribute('aria-pressed', 'true');
  await expect(documentRegion(page)).toHaveCSS('cursor', 'grab');

  const box = (await documentRegion(page).boundingBox())!;
  const start = await documentRegion(page).evaluate((el) => [el.scrollLeft, el.scrollTop]);
  await page.mouse.move(box.x + 500, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 150, { steps: 5 });
  await page.mouse.up();
  const end = await documentRegion(page).evaluate((el) => [el.scrollLeft, el.scrollTop]);
  expect(end[0] - start[0]).toBe(200);
  expect(end[1] - start[1]).toBe(150);
  // No text of the document is selected (the zoom field keeps its own selection).
  const documentSelection = await page.evaluate(() => {
    const selection = getSelection();
    const view = document.querySelector('pdfv-document-view')!;
    return selection && selection.rangeCount > 0 && !selection.isCollapsed
      ? view.contains(selection.getRangeAt(0).commonAncestorContainer)
      : false;
  });
  expect(documentSelection).toBe(false);
});
