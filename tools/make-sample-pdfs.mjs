// Generates the demo's sample PDFs, without any dependency.
// Usage: node tools/make-sample-pdfs.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../projects/demo/public/samples');

const PARAGRAPHS = [
  'Signals give Angular a precise picture of which parts of the screen depend on which pieces of state. When a value changes, only the views that read it are refreshed, which keeps rendering cheap even for large documents.',
  'A PDF viewer spends most of its time drawing pages. Rendering only the pages near the visible area, and releasing the canvases of pages far away, keeps memory stable whatever the number of pages.',
  'Accessibility is part of the design from the first line: every control has an accessible name, the toolbar follows the WAI-ARIA toolbar pattern, and status changes are announced to screen reader users.',
  'Themes are built on CSS custom properties. A theme is a set of tokens such as colors, radius and spacing, so a product team can match the viewer to its design system without overriding component styles.',
  'Search finds every occurrence of a word in the document text layer. Matches are highlighted on the page, and the next and previous buttons move between them while the current match stays in view.',
  'Annotations let readers add highlights and free text notes. They are stored in PDF coordinates, so they stay in place at every zoom level, and they are embedded into the file when it is downloaded.',
];

const SIZES = {
  letter: [612, 792],
  landscape: [792, 612],
  a5: [420, 595],
};

function escapeText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(text, maxChars) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function pageContent(pageNumber, total, [width, height]) {
  const margin = 56;
  const maxChars = Math.floor((width - 2 * margin) / 5.6);
  const ops = [];
  // Header band and page frame.
  ops.push('0.91 0.94 0.99 rg', `0 ${height - 40} ${width} 40 re f`);
  ops.push('0.04 0.34 0.82 rg', `${margin} ${height - 120} 6 48 re f`);
  ops.push('BT', '/F2 9 Tf', '0.25 0.27 0.3 rg', `${margin} ${height - 26} Td`, `(${escapeText('pdf-viewer-ng sample document')}) Tj`, 'ET');
  ops.push('BT', '/F2 22 Tf', '0.12 0.14 0.16 rg', `${margin + 16} ${height - 96} Td`, `(${escapeText(`Chapter ${pageNumber}`)}) Tj`, 'ET');

  let y = height - 150;
  ops.push('BT', '/F1 11 Tf', '14 TL', '0.12 0.14 0.16 rg', `${margin} ${y} Td`);
  for (let i = 0; i < PARAGRAPHS.length && y > 90; i++) {
    const paragraph = PARAGRAPHS[(pageNumber + i) % PARAGRAPHS.length];
    for (const line of wrap(paragraph, maxChars)) {
      if (y <= 90) break;
      ops.push(`(${escapeText(line)}) Tj`, 'T*');
      y -= 14;
    }
    ops.push('T*');
    y -= 14;
  }
  ops.push('ET');

  // Footer with the page number.
  ops.push('BT', '/F1 9 Tf', '0.34 0.38 0.42 rg', `${width / 2 - 24} 32 Td`, `(${escapeText(`Page ${pageNumber} of ${total}`)}) Tj`, 'ET');
  return ops.join('\n');
}

function buildPdf(title, pageSizes) {
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;

  const catalog = add(null);
  const pages = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const info = add(`<< /Title (${escapeText(title)}) /Producer (pdf-viewer-ng sample generator) >>`);

  const kids = pageSizes.map((size, index) => {
    const stream = pageContent(index + 1, pageSizes.length, size);
    const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    return add(
      `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${size[0]} ${size[1]}] ` +
        `/Resources << /Font << /F1 ${font} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${content} 0 R >>`,
    );
  });

  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R /Lang (en) >>`;
  objects[pages - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let pdf = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

mkdirSync(outDir, { recursive: true });

const mixed = Array.from({ length: 12 }, (_, i) => (i === 4 ? SIZES.landscape : i === 8 ? SIZES.a5 : SIZES.letter));
writeFileSync(join(outDir, 'sample.pdf'), buildPdf('pdf-viewer-ng sample', mixed));
writeFileSync(join(outDir, 'long.pdf'), buildPdf('pdf-viewer-ng long sample', Array(300).fill(SIZES.letter)));
writeFileSync(join(outDir, 'invalid.pdf'), 'This is not a PDF file.\n');
console.log(`Sample PDFs written to ${outDir}`);
