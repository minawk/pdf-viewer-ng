# Changelog

All notable changes to `@minawk/pdf-viewer-ng`. Versions follow [semantic versioning](https://semver.org).

## 0.4.0 (2026-11-19)

### Changed

- Default zoom: `'auto'`, 125%, or less to fit the page width on narrow screens (like Chrome and
  pdf.js), instead of fit to width. `zoom: 1.25` forces 125% everywhere; `zoom: 'fit-width'` restores
  the previous behavior.
- The zoom menu is replaced by a zoom level field, like Chrome: it shows the applied level, accepts a
  typed percentage ("150", "150%"), steps with the up and down arrow keys, and Escape cancels.
- A fit button next to the zoom buttons switches between fit to page and fit to width.
- Shorter toolbar fields: 28px (new `--pdfv-field-height` token) instead of 36px.
- Thinner focus style on the toolbar fields: the border takes the focus color, with a soft halo.
- Compact toolbar (viewers narrower than 768px, was 640px): 32px buttons, and first / last page move
  into the "More tools" menu, so the toolbar fits on one row on most phones.

### Added

- `'auto'` zoom mode (`PdfZoom`).
- Tooltips: every icon button shows its name on hover (`title`).
- `--pdfv-field-height` theme token.

### Fixed

- After a resize (or a phone rotation), the page could be shifted sideways: the reading position is
  now kept relative to the new size of the document area.

## 0.3.0 (2026-11-18)

### Added

- Clickable links of the document: web links open in a new tab, email and phone links open the
  system application, links to another place of the document (pages and named destinations) go
  there. Only safe protocols are kept; `javascript:` links are ignored. Links are reachable with Tab
  and named after the text under them. Two new messages: `externalLink` and `documentLink`.

## 0.2.3 (2026-11-18)

### Fixed

- Text notes no longer start with stray whitespace, on screen and in the downloaded PDF
  (`/Contents (  Approved)` instead of `(Approved)`). A regression of 0.2.2: reformatting the
  template moved the note text onto its own indented line, which notes display as typed. The text is
  now bound with `[textContent]`, so formatting cannot change it again.
- With the text tool, a press on the page right after choosing the tool could be missed when the
  browser was busy: the note is now created whatever the rendering state.

## 0.2.2 (2026-11-18)

No change of features : prettify and format all files

## 0.2.1 (2026-11-18)

No change to the library code: documentation and project only.

### Documentation

- Live demo, published on GitHub Pages: https://minawk.github.io/pdf-viewer-ng/. The README links to it,
  with the source and this changelog.

### Project

- The demo is tested (unit, `ng add`, end-to-end and accessibility tests) and deployed by a GitHub
  Actions workflow on every push to `main`.
- The demo page introduces the library: install command, links to the source, documentation and npm.

## 0.2.0 (2026-11-18)

### Added

- `ng add @minawk/pdf-viewer-ng`: one-command setup. Installs pdf.js, copies its worker and data files
  into the build, registers `providePdfViewer()` and adds the built-in themes. Options: `--project`,
  `--pdfjs-files=false` (worker only), `--themes=false`. Safe to run again.
- `workerSrc: 'cdn'` and `assetsUrl: 'cdn'`: load the pdf.js files from the jsDelivr CDN, at the
  installed pdf.js version, without copying them. Meant for prototypes: the CDN is a third-party
  server, unavailable offline and blocked by a strict Content Security Policy.

### Documentation

- The README installation starts with `ng add`, explains why pdf.js needs its worker file, and keeps
  the manual setup steps.

## 0.1.0 (2026-11-18)

First release.

- PDF rendering with pdf.js 6, loaded lazily; only pages near the visible area are rendered.
- Continuous and single page modes, pagination, `[(page)]`.
- Zoom: presets, fit to width, fit to page, Ctrl + wheel, pinch, keyboard shortcuts, `[(zoom)]`.
- Text selection and copy, pan tool.
- Search with match case and whole words, highlighted results.
- Open (file picker, drag and drop), download, print.
- Highlight and free text annotations, saved into the downloaded PDF and printed, `[(annotations)]`.
- Themes: light, dark, high contrast, material, auto, and custom themes from CSS variables or a Sass mixin.
- Narrow viewers move secondary tools into a "More tools" menu.
- Accessibility: WAI-ARIA toolbar and menu patterns, screen reader announcements, full keyboard support, WCAG 2.2 AA (axe-checked).
- Every string can be translated with `providePdfViewerMessages()`.
