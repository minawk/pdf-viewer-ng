import { readFileSync } from 'node:fs';
import { expect, Page, test } from '@playwright/test';

const SAMPLE = 'projects/demo/public/samples/sample.pdf';
const LONG = 'projects/demo/public/samples/long.pdf';
const status = (page: Page) => page.locator('pdfv-viewer [role="status"]');
const pages = (page: Page) => page.locator('pdfv-page');

interface PrintedDocument {
  images: number;
  sizes: string[];
}

/** Headless browsers cannot print: report what would be printed instead. */
async function stubPrinting(page: Page) {
  await page.addInitScript(() => {
    window.print = function () {
      const images = Array.from(document.images);
      window.top!.postMessage(
        {
          pdfvPrinted: {
            images: images.length,
            sizes: images.map((i) => `${i.style.width} ${i.style.height}`),
          },
        },
        '*',
      );
      setTimeout(() => dispatchEvent(new Event('afterprint')), 10);
    };
    if (window === window.top) {
      addEventListener('message', (event) => {
        if (event.data?.pdfvPrinted) {
          (window as unknown as { printed: unknown }).printed = event.data.pdfvPrinted;
        }
      });
    }
  });
}

async function open(page: Page) {
  await page.goto('/');
  await expect(pages(page)).toHaveCount(12, { timeout: 15_000 });
}

/** Drags a file from outside the browser and drops it on the document area. */
async function dropFile(page: Page, name: string, type: string, url: string) {
  return page.evaluate(
    async ({ name, type, url }) => {
      const bytes = await (await fetch(url)).arrayBuffer();
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], name, { type }));
      const target = document.querySelector('pdfv-document-view')!;
      const fire = (type: string) =>
        target.dispatchEvent(
          new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }),
        );
      fire('dragenter');
      fire('dragover');
      await new Promise((resolve) => setTimeout(resolve, 50));
      const overlayShown = !!document.querySelector('pdfv-viewer .drop-overlay');
      fire('drop');
      return overlayShown;
    },
    { name, type, url },
  );
}

test.describe('open', () => {
  test('opens a PDF chosen in the file picker', async ({ page }) => {
    await open(page);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Open file' }).click(),
    ]);
    expect(chooser.isMultiple()).toBe(false);
    await chooser.setFiles(LONG);
    await expect(pages(page)).toHaveCount(300, { timeout: 15_000 });
    await expect(page.locator('pdfv-pager .page-total')).toHaveText('of 300');
    // The temporary input is gone.
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });

  test('rejects files that are not PDFs', async ({ page }) => {
    await open(page);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Open file' }).click(),
    ]);
    await chooser.setFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    await expect(status(page)).toHaveText('Only PDF files can be opened.');
    await expect(pages(page)).toHaveCount(12);
  });

  test('opens a PDF dropped on the viewer, showing a drop zone while dragging', async ({
    page,
  }) => {
    await open(page);
    const overlayShown = await dropFile(page, 'dropped.pdf', 'application/pdf', 'samples/long.pdf');
    expect(overlayShown).toBe(true);
    await expect(pages(page)).toHaveCount(300, { timeout: 15_000 });
    await expect(page.locator('pdfv-viewer .drop-overlay')).toHaveCount(0);
  });

  test('is available without a document', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Document', { exact: true }).selectOption('samples/invalid.pdf');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open file' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Download' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

test.describe('download', () => {
  test('downloads the original file under its name', async ({ page }) => {
    await open(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('sample.pdf');
    const bytes = readFileSync((await download.path())!);
    expect(bytes.equals(readFileSync(SAMPLE))).toBe(true);
    await expect(page.locator('output')).toContainText('downloaded: sample.pdf');
  });

  test('names the download after an opened file', async ({ page }) => {
    await open(page);
    await dropFile(page, 'Quarterly report.pdf', 'application/pdf', 'samples/sample.pdf');
    await expect(page.locator('output')).toContainText('loaded: 12 pages');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('Quarterly report.pdf');
  });
});

test.describe('print', () => {
  test('prints every page, each on a sheet of its own size', async ({ page }) => {
    await stubPrinting(page);
    await open(page);
    await page.getByRole('button', { name: 'Print' }).click();
    const printed = (
      await page.waitForFunction(() => (window as unknown as { printed?: unknown }).printed)
    ).jsonValue();
    const result = (await printed) as PrintedDocument;
    expect(result.images).toBe(12);
    expect(result.sizes[0]).toBe('612pt 792pt');
    expect(result.sizes[4]).toBe('792pt 612pt'); // landscape page
    expect(result.sizes[8]).toBe('420pt 595pt'); // A5 page
    await expect(status(page)).toHaveText('Document ready to print.');
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Print' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('shows an accessible progress dialog, cancellable with Escape', async ({ page }) => {
    await stubPrinting(page);
    await page.goto('/');
    await page.getByLabel('Document', { exact: true }).selectOption('samples/long.pdf');
    await expect(pages(page)).toHaveCount(300, { timeout: 15_000 });

    const printButton = page.getByRole('button', { name: 'Print' });
    await printButton.click();
    const dialog = page.getByRole('dialog', { name: 'Preparing document for printing…' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuetext', /of 300 pages/);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(status(page)).toHaveText('Printing cancelled.');
    await expect(printButton).toBeFocused();
    expect(
      await page.evaluate(() => (window as unknown as { printed?: unknown }).printed),
    ).toBeUndefined();
  });
});
