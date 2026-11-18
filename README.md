# pdf-viewer-ng workspace

Source of [`@minawk/pdf-viewer-ng`](projects/pdf-viewer-ng/README.md), an accessible, signal-based PDF
viewer for Angular, and its demo application.

**Live demo: https://minawk.github.io/pdf-viewer-ng/**

## Projects

| Path                         | What                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects/pdf-viewer-ng`     | The library (ng-packagr), and its `ng add` schematic in `schematics/` (compiled separately to CommonJS). Its README is the npm documentation. |
| `projects/demo`              | Demo application: documents, themes, page modes, bindings. Compiles the library from source.                                                  |
| `e2e`                        | Playwright tests on the demo, accessibility audits (axe) included.                                                                            |
| `tools/make-sample-pdfs.mjs` | Generates the demo's sample PDFs (`node tools/make-sample-pdfs.mjs`).                                                                         |

Library layout: one folder per component, and one per file that has unit tests.

```
src/lib/
  pdf-viewer/       <pdfv-viewer>: the public component
  core/             configuration, messages, pdf.js engine, per-viewer state (viewer-store/)
  toolbar/          toolbar/, pager/, zoom-control/, overflow-menu/, roving-toolbar/
  document/         document-view/ (scrolling, virtualization), page/, text-layer/, gestures
  search/           search-bar/, text-search/ (matching), search-store
  annotations/      annotation-layer/, annotation-store/, geometry/, model
  features/         file-actions (open, download), print, print-dialog/
  icon/, utils/     icons; zoom/ and file-name/ helpers
styles/             tokens, themes, mixins (published as Sass)
```

## Commands

| Command                   | What                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `npm start`               | Demo on http://localhost:4200, library from source with live reload.                                                              |
| `npm test`                | Library unit tests (Vitest).                                                                                                      |
| `npm run test:schematics` | Builds the library, then tests `ng add` on a generated Angular workspace (node:test).                                             |
| `npm run e2e`             | End-to-end and accessibility tests. Uses Playwright's Chromium, or a local one: `PW_CHROMIUM_PATH=/usr/bin/chromium npm run e2e`. |
| `npm run build`           | Builds the library (`dist/minawk/pdf-viewer-ng`) with its `ng add` schematic, then the demo.                                      |
| `npm run build:pages`     | Builds the demo as served on GitHub Pages (under `/pdf-viewer-ng/`), in `dist/demo/browser`.                                      |
| `npm run publish:lib`     | Builds the library and publishes it to npm (public, scoped package).                                                              |

## Releasing

1. Update `version` in `projects/pdf-viewer-ng/package.json` and `projects/pdf-viewer-ng/CHANGELOG.md`.
2. `npm test && npm run test:schematics && npm run e2e`.
3. `npm login` (once), then `npm run publish:lib`.

## Demo deployment

The [Demo workflow](.github/workflows/demo.yml) runs on every push to `main` (and on demand, from the
Actions tab): it runs the unit, `ng add` and end-to-end tests, then builds the demo and publishes it to
GitHub Pages. A failing test stops the deployment; the test report is kept as a run artifact.

One-time setup, in the repository settings on GitHub: **Settings › Pages › Build and deployment ›
Source: GitHub Actions**. GitHub Pages requires a public repository on the free plan.

The demo is built with `--base-href /<repository name>/`, the path of project pages. Every URL in the
demo is relative (sample PDFs, pdf.js worker and data files), so it works under any path.
