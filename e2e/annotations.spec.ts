import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

const firstPage = (page: Page) => page.locator('pdfv-page[data-page-number="1"]');
const run = (page: Page, text: string) => firstPage(page).locator('pdfv-text-layer span').filter({ hasText: text });
const status = (page: Page) => page.locator('pdfv-viewer [role="status"]');
const highlights = (page: Page) => page.locator('pdfv-annotation-layer .highlight');
const notes = (page: Page) => page.locator('pdfv-annotation-layer .note:not(.editing)');
const editor = (page: Page) => page.getByRole('textbox', { name: 'Text note' });

async function open(page: Page) {
  await page.goto('/');
  await expect(run(page, 'Chapter 1')).toBeAttached({ timeout: 15_000 });
}

/** Drags across text, from the start of one run to the middle of another. */
async function dragAcross(page: Page, from: string, to: string) {
  const start = (await run(page, from).boundingBox())!;
  const end = (await run(page, to).boundingBox())!;
  await page.mouse.move(start.x + 1, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function addNoteWithTextTool(page: Page, text: string, x = 600, y = 220) {
  await page.getByRole('button', { name: 'Add text' }).click();
  const box = (await firstPage(page).boundingBox())!;
  await page.mouse.click(box.x + x, box.y + y);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

test.describe('highlights', () => {
  test('the highlight tool highlights the selected text', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Highlight', exact: true }).click();
    await dragAcross(page, 'A PDF viewer spends', 'visible area, and releasing');

    await expect(highlights(page)).toHaveCount(1);
    await expect(highlights(page).locator('.line')).toHaveCount(2); // one per line
    await expect(highlights(page)).toHaveAccessibleName(/^Highlight: A PDF viewer spends most of its time/);
    await expect(status(page)).toHaveText('Highlight added.');
    await expect(page.locator('output')).toContainText('annotations 1');
    expect(await page.evaluate(() => String(getSelection()))).toBe('');
  });

  test('the Highlight button highlights an existing selection (keyboard way)', async ({ page }) => {
    await open(page);
    // A selection made without the mouse.
    await run(page, 'Chapter 1').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    const button = page.getByRole('button', { name: 'Highlight', exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(highlights(page)).toHaveAccessibleName('Highlight: Chapter 1');
    // The tool itself was not switched on.
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  test('stays on its text when zooming', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Highlight', exact: true }).click();
    await dragAcross(page, 'Chapter 1', 'Chapter 1');
    const offset = async () => {
      const text = (await run(page, 'Chapter 1').boundingBox())!;
      const mark = (await highlights(page).boundingBox())!;
      const page1 = (await firstPage(page).boundingBox())!;
      return { x: (mark.x - text.x) / page1.width, y: (mark.y - text.y) / page1.height };
    };
    const before = await offset();
    await page.getByRole('combobox', { name: 'Zoom level' }).selectOption('2');
    await expect.poll(async () => (await firstPage(page).boundingBox())!.width).toBeCloseTo(1632, 0);
    await expect.poll(async () => (await offset()).x).toBeCloseTo(before.x, 2);
    expect((await offset()).y).toBeCloseTo(before.y, 2);
  });

  test('is selected by a click, then deleted with the Delete key', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Highlight', exact: true }).click();
    await dragAcross(page, 'Chapter 1', 'Chapter 1');
    await page.getByRole('button', { name: 'Select text' }).click();

    const box = (await run(page, 'Chapter 1').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(highlights(page)).toBeFocused();
    await expect(page.getByRole('toolbar', { name: 'Annotation options' })).toBeVisible();

    await page.keyboard.press('Delete');
    await expect(highlights(page)).toHaveCount(0);
    await expect(status(page)).toHaveText('Annotation deleted.');
    await expect(page.getByRole('region', { name: 'PDF document' })).toBeFocused();
  });

  test('changes color from its options toolbar', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Highlight', exact: true }).click();
    await dragAcross(page, 'Chapter 1', 'Chapter 1');
    await highlights(page).focus();
    const toolbar = page.getByRole('toolbar', { name: 'Annotation options' });
    await toolbar.getByRole('button', { name: 'Green' }).click();
    await expect(toolbar.getByRole('button', { name: 'Green' })).toHaveAttribute('aria-pressed', 'true');
    await expect(highlights(page).locator('.line').first()).toHaveCSS('background-color', 'rgb(83, 255, 188)');
  });
});

test.describe('text notes', () => {
  test('the text tool writes a note where the page is clicked', async ({ page }) => {
    await open(page);
    await addNoteWithTextTool(page, 'Reviewed\nby QA');
    await expect(notes(page)).toHaveText('Reviewed\nby QA');
    await expect(notes(page)).toBeFocused();
    await expect(notes(page)).toHaveAccessibleName('Text note: Reviewed\nby QA');
    await expect(page.locator('output')).toContainText('annotations 1');
  });

  test('can be written entirely with the keyboard', async ({ page }) => {
    await open(page);
    const button = page.getByRole('button', { name: 'Add text' });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeFocused();
    await expect(status(page)).toHaveText(/^Text note added/);
    await page.keyboard.type('Keyboard note');
    await page.keyboard.press('Escape');
    await expect(notes(page)).toHaveText('Keyboard note');
    await expect(notes(page)).toBeFocused();
  });

  test('an empty note is discarded', async ({ page }) => {
    await open(page);
    await addNoteWithTextTool(page, '');
    await expect(notes(page)).toHaveCount(0);
  });

  test('moves with the arrow keys, edits with Enter, resizes its text', async ({ page }) => {
    await open(page);
    await addNoteWithTextTool(page, 'Move me');
    const left = () => notes(page).evaluate((el) => el.getBoundingClientRect().left);
    const before = await left();
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(left).toBeGreaterThan(before + 5);

    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type(' now');
    await page.keyboard.press('Escape');
    await expect(notes(page)).toHaveText('Move me now');

    const size = () => notes(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const fontBefore = await size();
    await page.getByRole('toolbar', { name: 'Annotation options' }).getByRole('button', { name: 'Larger text' }).click();
    await expect.poll(size).toBeGreaterThan(fontBefore);
  });

  test('is dragged with the mouse', async ({ page }) => {
    await open(page);
    await addNoteWithTextTool(page, 'Drag me');
    await page.getByRole('button', { name: 'Select text' }).click();
    const box = (await notes(page).boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 105, box.y + 65, { steps: 6 });
    await page.mouse.up();
    const moved = (await notes(page).boundingBox())!;
    expect(moved.x - box.x).toBeCloseTo(100, -1);
    expect(moved.y - box.y).toBeCloseTo(60, -1);
  });
});

test('annotations are saved into the downloaded PDF', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await dragAcross(page, 'Chapter 1', 'Chapter 1');
  await addNoteWithTextTool(page, 'Approved');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  const bytes = readFileSync((await download.path())!).toString('latin1');
  expect(bytes).toContain('/Subtype /Highlight');
  expect(bytes).toContain('/QuadPoints');
  expect(bytes).toContain('/Subtype /FreeText');
  expect(bytes).toContain('(Approved)');
});

test('a new document starts without annotations', async ({ page }) => {
  await open(page);
  await addNoteWithTextTool(page, 'Note');
  await expect(page.locator('output')).toContainText('annotations 1');
  await page.getByLabel('Document', { exact: true }).selectOption('samples/long.pdf');
  await expect(page.locator('pdfv-page')).toHaveCount(300, { timeout: 15_000 });
  await expect(page.locator('output')).toContainText('annotations 0');
  await expect(notes(page)).toHaveCount(0);
});

test('annotations, their toolbar and the note editor have no axe violations', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await dragAcross(page, 'Chapter 1', 'Chapter 1');
  await addNoteWithTextTool(page, 'Accessible note');
  await expect(page.getByRole('toolbar', { name: 'Annotation options' })).toBeVisible();
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);

  await page.keyboard.press('Enter'); // edit the note
  await expect(editor(page)).toBeFocused();
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});

test('annotations are printed', async ({ page }) => {
  // Headless browsers cannot print: count the highlight color in the first printed page instead.
  await page.addInitScript(() => {
    window.print = function () {
      const image = document.images[0];
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let yellow = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 120 && data[i + 2] < 175) yellow++;
      }
      window.top!.postMessage({ yellowPixels: yellow }, '*');
      setTimeout(() => dispatchEvent(new Event('afterprint')), 10);
    };
    if (window === window.top) {
      addEventListener('message', (event) => {
        if ('yellowPixels' in (event.data ?? {})) {
          (window as unknown as { yellowPixels: number }).yellowPixels = event.data.yellowPixels;
        }
      });
    }
  });
  const printYellow = async () => {
    await page.evaluate(() => delete (window as unknown as { yellowPixels?: number }).yellowPixels);
    await page.getByRole('button', { name: 'Print' }).click();
    await page.waitForFunction(() => (window as unknown as { yellowPixels?: number }).yellowPixels !== undefined);
    return page.evaluate(() => (window as unknown as { yellowPixels: number }).yellowPixels);
  };

  await open(page);
  expect(await printYellow()).toBeLessThan(100);
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await dragAcross(page, 'A PDF viewer spends', 'A PDF viewer spends');
  await expect(highlights(page)).toHaveCount(1);
  expect(await printYellow()).toBeGreaterThan(2000);
});
