# @minawk/pdf-viewer-ng

A lightweight, accessible PDF viewer for Angular 22, built entirely on signals.

- **View**: continuous or single page mode, pagination, zoom (125% by default, typed level, zoom in and out, fit to page or width, Ctrl + wheel, pinch), pan tool.
- **Read**: text selection and copy, search with match case and whole words, clickable links (web, email, and links to other pages of the document).
- **Files**: open (file picker, drag and drop), download, print.
- **Edit**: highlights and free text notes, saved into the downloaded PDF as standard annotations, and printed.
- **Themes**: light, dark, high contrast, material, auto, and your own, from CSS variables or a Sass mixin.
- **Accessible**: WCAG 2.2 AA (checked with axe), full keyboard support, screen reader announcements.
- **Fast and light**: pdf.js is loaded only when a document is opened; only the pages near the visible area are rendered.

**[Live demo](https://minawk.github.io/pdf-viewer-ng/)** · [Source](https://github.com/minawk/pdf-viewer-ng) · [Changelog](https://github.com/minawk/pdf-viewer-ng/blob/main/projects/pdf-viewer-ng/CHANGELOG.md)

## Installation

```bash
ng add @minawk/pdf-viewer-ng
```

That is all the setup. The command:

- installs `pdfjs-dist`, the PDF engine;
- copies its worker and data files into your build (`angular.json` assets);
- adds `providePdfViewer()` to your application configuration;
- adds the built-in themes to your global styles.

Options: `--project <name>` for a multi-application workspace, `--pdfjs-files=false` to copy only the
required worker, `--themes=false` to skip the themes. Running it again changes nothing.

Requires Angular 22 and pdfjs-dist 6.5 or later.

### Use it

```ts
import { PdfViewer } from '@minawk/pdf-viewer-ng';

@Component({
  imports: [PdfViewer],
  template: `<pdfv-viewer src="assets/report.pdf" [(page)]="page" theme="auto" />`,
  styles: `
    pdfv-viewer {
      block-size: 80dvh;
    }
  `,
})
export class Report {
  protected readonly page = signal(1);
}
```

The viewer fills the height of its container (minimum 20rem): give it a height.

### Without copying files: CDN

pdf.js reads PDFs in a web worker, a script that must be served as a file: a library cannot add it to
your build by itself, which is why `ng add` configures the copy. To skip the copy, load the pdf.js
files from the jsDelivr CDN, at the exact version installed:

```ts
providePdfViewer({ workerSrc: 'cdn', assetsUrl: 'cdn' });
```

Convenient for prototypes; for production, prefer your own copy: the CDN is a third-party server
(it sees your users' requests), is unreachable offline, and is blocked by a strict Content Security Policy.

### Manual setup

What `ng add` does, if you prefer to do it yourself:

1. `npm install @minawk/pdf-viewer-ng pdfjs-dist`
2. In `angular.json`, in the `assets` of your application's build options (only the worker is required;
   the other folders improve the rendering of Asian scripts, non-embedded fonts, JPEG 2000 / JBIG2
   images and ICC color profiles):

   ```json
   { "glob": "pdf.worker.min.mjs", "input": "node_modules/pdfjs-dist/build", "output": "assets/pdfjs" },
   { "glob": "**/*", "input": "node_modules/pdfjs-dist/cmaps", "output": "assets/pdfjs/cmaps" },
   { "glob": "**/*", "input": "node_modules/pdfjs-dist/standard_fonts", "output": "assets/pdfjs/standard_fonts" },
   { "glob": "**/*", "input": "node_modules/pdfjs-dist/wasm", "output": "assets/pdfjs/wasm" },
   { "glob": "**/*", "input": "node_modules/pdfjs-dist/iccs", "output": "assets/pdfjs/iccs" }
   ```

3. In `app.config.ts`: `providePdfViewer({ assetsUrl: 'assets/pdfjs/' })` (or `providePdfViewer()`
   with the worker only).
4. Themes: the light theme is built in. For the others, add
   `node_modules/@minawk/pdf-viewer-ng/styles/themes/all.scss` (or `dark.scss`, `high-contrast.scss`...)
   to the `styles` of `angular.json`, or in your global Sass:

   ```scss
   @use '@minawk/pdf-viewer-ng/styles' as pdfv;

   @include pdfv.all-themes(); // or: @include pdfv.builtin-theme('dark');
   ```

## API

### Inputs

| Input      | Type                                                                     | Default                                     | Description                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`      | `string \| URL \| ArrayBuffer \| Uint8Array \| Blob \| File`             |                                             | The document. Binary data is copied, never detached.                                                                                                                                           |
| `fileName` | `string`                                                                 | name of the opened file or last URL segment | Name of the downloaded file.                                                                                                                                                                   |
| `theme`    | `'light' \| 'dark' \| 'high-contrast' \| 'material' \| 'auto' \| string` | `'light'`                                   | Built-in or custom theme.                                                                                                                                                                      |
| `tools`    | `PdfViewerTool[]`                                                        | every tool                                  | Toolbar items, in order: `'pager'`, `'zoom'`, `'interaction'`, `'annotate'`, `'search'`, `'open'`, `'download'`, `'print'`, `'spacer'`. `[]` hides the toolbar. Dropping files needs `'open'`. |
| `pageMode` | `'continuous' \| 'single'`                                               | `'continuous'`                              | All pages in one scrolling view, or one page per view.                                                                                                                                         |

### Two-way bindings

| Model             | Type                                            | Description                                                                                                                                                                                          |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[(page)]`        | `number`                                        | Current page, 1-based. Follows scrolling and navigation. Set it with `src` to open a document at a given page.                                                                                       |
| `[(zoom)]`        | `'auto' \| 'fit-width' \| 'fit-page' \| number` | Zoom. `'auto'` (default): 125%, or less to fit the page width on narrow screens, like Chrome. Numbers are factors of the actual size (`1` = 100%, from `0.1` to `4`); `1.25` forces 125% everywhere. |
| `[(annotations)]` | `PdfAnnotation[]`                               | Highlights and text notes. A replacing document starts without annotations unless you provide new ones.                                                                                              |

### Outputs

| Output         | Payload                                                              | When                                                                                    |
| -------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `(loaded)`     | `{ pageCount, document }`                                            | A document was opened. `document` is the pdf.js `PDFDocumentProxy` (do not destroy it). |
| `(loadError)`  | `{ kind: 'invalid' \| 'missing' \| 'password' \| 'unknown', error }` | A document could not be opened.                                                         |
| `(fileOpened)` | `File`                                                               | The user opened a local file.                                                           |
| `(downloaded)` | `{ fileName, size }`                                                 | The document was downloaded.                                                            |

### Methods

For custom toolbars: `openFile()`, `download()`, `print()`.

### Configuration

`providePdfViewer(config)`, every option is optional:

| Option                               | Default                                         | Description                                             |
| ------------------------------------ | ----------------------------------------------- | ------------------------------------------------------- |
| `workerSrc`                          | `'assets/pdfjs/pdf.worker.min.mjs'`             | URL of the pdf.js worker, or `'cdn'`.                   |
| `assetsUrl`                          | `null` (`ng add` sets `'assets/pdfjs/'`)        | Base URL of the optional pdf.js folders, or `'cdn'`.    |
| `theme`, `tools`, `pageMode`, `zoom` | `'light'`, every tool, `'continuous'`, `'auto'` | Defaults of the inputs.                                 |
| `maxPixelRatio`                      | `2`                                             | Canvas resolution cap on high-density screens (memory). |
| `printResolution`                    | `150`                                           | Print resolution, in dots per inch.                     |

## Annotations

```ts
type PdfAnnotation = PdfHighlightAnnotation | PdfTextAnnotation;
// { id, type: 'highlight', page, color, rects: PdfRect[], text }
// { id, type: 'text', page, color, rect: PdfRect, text, fontSize, rotation? }
// PdfRect: [x1, y1, x2, y2] in PDF points, origin at the bottom-left corner of the page.
```

Coordinates do not depend on the zoom: store the annotations with your document (two-way binding),
and give them back to the viewer later. **Download** writes them into the file as standard PDF
`/Highlight` and `/FreeText` annotations, readable by any PDF reader; **print** includes them.

- Highlight: choose the highlight tool, then select text. Or select text first, then press the Highlight button.
- Text note: choose the text tool, then click on the page. From the keyboard, the Add text button writes a note in view.
- Select an annotation (click it, or Tab to it) to change its color or text size, or delete it.

Annotations already in a PDF are displayed but cannot be edited. Text notes are saved in Helvetica:
Western European characters only.

## Theming

Every color, size and radius is a CSS custom property named `--pdfv-*`. Override any of them:

```css
pdfv-viewer {
  --pdfv-color-primary: #7b1fa2;
  --pdfv-radius: 12px;
}
```

Or define a named theme from a built-in base, and select it with `theme="ocean"`:

```scss
@use '@minawk/pdf-viewer-ng/styles' as pdfv;

@include pdfv.theme(
  'ocean',
  (
    'color-primary': #006782,
    'color-toolbar': #e3f2f7,
    'color-canvas': #cfe6ee,
  ),
  $base: 'light'
);
```

Tokens, without the `--pdfv-` prefix: `font-family`, `font-size`, `line-height`, `radius`, `radius-sm`,
`space-1` to `space-3`, `control-size`, `field-height`, `icon-size`, `focus-width`, `transition-duration`,
`color-surface`, `color-on-surface`, `color-on-surface-muted`, `color-toolbar`, `color-on-toolbar`,
`color-border`, `color-border-strong`, `color-canvas`, `color-page`, `color-primary`, `color-on-primary`,
`color-state-hover`, `color-state-pressed`, `color-selected`, `color-on-selected`, `color-focus`,
`color-disabled`, `color-error`, `color-search-match`, `color-search-current`, `color-text-selection`,
`shadow-page`, `shadow-toolbar`.

Priority, whatever the selectors: built-in defaults, then themes, then your own CSS (cascade layers
`pdfv.base` and `pdfv.theme`). In development, the console warns about a theme whose stylesheet is not loaded.
Keep at least 4.5:1 contrast for text and 3:1 for borders and focus indicators in your themes.

The viewer adapts to its own width, not the window's: below 640px, secondary tools move into a
"More tools" menu.

## Translations

Every string, accessible names and announcements included:

```ts
providePdfViewerMessages({
  print: 'Imprimer',
  pageLabel: (page, total) => `Page ${page} sur ${total}`,
});
```

See `PdfViewerMessages` for the full list.

## Accessibility

The toolbar and menus follow the WAI-ARIA Authoring Practices; the page text is available to screen
readers; navigation, zoom, search results and edits are announced; every feature works with the
keyboard; the high contrast theme and Windows high contrast mode are supported; motion is reduced
when the user asks for it.

| Where                      | Keys                               | Action                       |
| -------------------------- | ---------------------------------- | ---------------------------- |
| Toolbar                    | Tab, then ← → Home End             | Move between tools           |
| "More tools"               | ↓ ↑ to open, ↓ ↑ Home End, Escape  | Menu                         |
| Anywhere in the viewer     | Ctrl/⌘ + F                         | Search                       |
|                            | F3 or Ctrl/⌘ + G (Shift: previous) | Next search result           |
|                            | Ctrl/⌘ + `+` `-` `0`               | Zoom in, out, reset          |
| Zoom field                 | type a level, Enter; ↑ ↓; Escape   | Apply, step, cancel          |
| Search field               | Enter, Shift + Enter, Escape       | Next, previous result, close |
| Document                   | Home, End                          | First, last page             |
| Document, single page mode | ← →, Page Up/Down                  | Previous, next page          |
| Annotation                 | Delete, Escape                     | Delete, deselect             |
| Text note                  | Enter, arrows (Shift: ×10)         | Edit, move                   |
| Text note being written    | Escape or Ctrl/⌘ + Enter           | Done                         |

In continuous mode, the text of pages far from the visible area is not in the page yet (as in every
pdf.js based viewer): use search, or navigate, to reach it.

## Links

Links of the document are clickable, and reachable with Tab:

- web links open in a new tab (`rel="noopener noreferrer"`); email and phone links open the mail or phone application;
- links to another place of the document (tables of contents, cross-references) go to that page;
- only safe protocols are kept (http, https, ftp, mailto, tel): `javascript:` and other links are ignored;
- each link is named after the text under it, for screen readers ("Project on GitHub (opens in a new tab)").

## Other notes

- **Server-side rendering**: safe; nothing is loaded on the server.
- **Password-protected documents** report a `password` load error; a password prompt is not available yet.
- **Several viewers** on one page are independent.

## License

MIT
