# Changelog

## 0.1.0

First release.

- `ng add @minawk/pdf-viewer-ng`: one-command setup (pdf.js, build assets, provider, themes).
- `workerSrc: 'cdn'` and `assetsUrl: 'cdn'`: load the pdf.js files from jsDelivr, without copying them.
- PDF rendering with pdf.js 6, loaded lazily; only pages near the visible area are rendered.
- Continuous and single page modes, pagination, `[(page)]`.
- Zoom: presets, fit to width, fit to page, Ctrl + wheel, pinch, keyboard shortcuts, `[(zoom)]`.
- Text selection and copy, pan tool.
- Search with match case and whole words, highlighted results.
- Open (file picker, drag and drop), download, print.
- Highlight and free text annotations, saved into the downloaded PDF and printed, `[(annotations)]`.
- Themes: light, dark, high contrast, material, auto, and custom themes from CSS variables or a Sass mixin.
- Accessibility: WAI-ARIA toolbar and menu patterns, screen reader announcements, full keyboard support, WCAG 2.2 AA (axe-checked).
- Every string can be translated with `providePdfViewerMessages()`.
