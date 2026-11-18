import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import path from 'node:path';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';

// Runs the compiled schematic from the built package, as `ng add` does.
const collection = path.resolve(__dirname, '../../../dist/minawk/pdf-viewer-ng/schematics/collection.json');
const runner = new SchematicTestRunner('@minawk/pdf-viewer-ng', collection);

async function createApp(): Promise<UnitTestTree> {
  const workspace = await runner.runExternalSchematic('@schematics/angular', 'workspace', {
    name: 'workspace',
    newProjectRoot: 'projects',
    version: '22.0.0',
  });
  return runner.runExternalSchematic('@schematics/angular', 'application', { name: 'app', standalone: true }, workspace);
}

function buildOptions(tree: UnitTestTree) {
  const workspace = JSON.parse(tree.readText('angular.json'));
  return workspace.projects.app.architect.build.options as { assets: unknown[]; styles: unknown[] };
}

describe('ng-add', () => {
  let app: UnitTestTree;

  beforeEach(async () => {
    app = await createApp();
  });

  it('installs pdf.js', async () => {
    const tree = await runner.runSchematic('ng-add', {}, app);
    const packageJson = JSON.parse(tree.readText('package.json'));
    assert.equal(packageJson.dependencies['pdfjs-dist'], '^6.5.0');
  });

  it('copies the pdf.js worker and data files into the build', async () => {
    const tree = await runner.runSchematic('ng-add', {}, app);
    const assets = buildOptions(tree).assets;
    assert.deepEqual(assets.slice(-5), [
      { glob: 'pdf.worker.min.mjs', input: 'node_modules/pdfjs-dist/build', output: 'assets/pdfjs' },
      { glob: '**/*', input: 'node_modules/pdfjs-dist/cmaps', output: 'assets/pdfjs/cmaps' },
      { glob: '**/*', input: 'node_modules/pdfjs-dist/standard_fonts', output: 'assets/pdfjs/standard_fonts' },
      { glob: '**/*', input: 'node_modules/pdfjs-dist/wasm', output: 'assets/pdfjs/wasm' },
      { glob: '**/*', input: 'node_modules/pdfjs-dist/iccs', output: 'assets/pdfjs/iccs' },
    ]);
  });

  it('registers the viewer configuration in the application', async () => {
    const tree = await runner.runSchematic('ng-add', {}, app);
    const config = tree.readText('projects/app/src/app/app.config.ts');
    assert.match(config, /import \{ providePdfViewer \} from '@minawk\/pdf-viewer-ng';/);
    assert.match(config, /providePdfViewer\(\{ assetsUrl: 'assets\/pdfjs\/' \}\)/);
  });

  it('adds the built-in themes', async () => {
    const tree = await runner.runSchematic('ng-add', {}, app);
    assert.ok(buildOptions(tree).styles.includes('node_modules/@minawk/pdf-viewer-ng/styles/themes/all.scss'));
  });

  it('keeps it minimal on demand: the worker only, no themes', async () => {
    const tree = await runner.runSchematic('ng-add', { pdfjsFiles: false, themes: false }, app);
    const { assets, styles } = buildOptions(tree);
    assert.equal(assets.filter((asset) => JSON.stringify(asset).includes('pdfjs-dist')).length, 1);
    assert.ok(!styles.some((style) => JSON.stringify(style).includes('pdf-viewer-ng')));
    assert.match(tree.readText('projects/app/src/app/app.config.ts'), /providePdfViewer\(\)/);
  });

  it('can run twice without duplicating anything', async () => {
    const once = await runner.runSchematic('ng-add', {}, app);
    const twice = await runner.runSchematic('ng-add', {}, once);
    assert.deepEqual(buildOptions(twice), buildOptions(once));
    const config = twice.readText('projects/app/src/app/app.config.ts');
    assert.equal(config.match(/providePdfViewer\(/g)?.length, 1);
  });

  it('reports an unknown project', async () => {
    await assert.rejects(runner.runSchematic('ng-add', { project: 'nope' }, app), /No Angular application named "nope"/);
  });
});
