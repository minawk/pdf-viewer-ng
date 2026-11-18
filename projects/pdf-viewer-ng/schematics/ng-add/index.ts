import {
  chain,
  noop,
  Rule,
  SchematicContext,
  SchematicsException,
  Tree,
} from '@angular-devkit/schematics';
import {
  addDependency,
  addRootProvider,
  DependencyType,
  ExistingBehavior,
  readWorkspace,
  updateWorkspace,
} from '@schematics/angular/utility';
import { NgAddOptions } from './schema';

/** Keep in sync with the `pdfjs-dist` peer dependency of the library. */
export const PDFJS_VERSION_RANGE = '^6.5.0';
/** Where the pdf.js files are copied: the defaults of `providePdfViewer()` point there. */
export const PDFJS_OUTPUT = 'assets/pdfjs';
export const THEMES_STYLESHEET = 'node_modules/@minawk/pdf-viewer-ng/styles/themes/all.scss';

interface AssetEntry {
  readonly glob: string;
  readonly input: string;
  readonly output: string;
}

/** The worker is required; the other folders improve rendering (fonts, Asian scripts, images, colors). */
export function pdfjsAssets(withOptionalFiles: boolean): AssetEntry[] {
  const worker = {
    glob: 'pdf.worker.min.mjs',
    input: 'node_modules/pdfjs-dist/build',
    output: PDFJS_OUTPUT,
  };
  if (!withOptionalFiles) {
    return [worker];
  }
  return [
    worker,
    ...['cmaps', 'standard_fonts', 'wasm', 'iccs'].map((folder) => ({
      glob: '**/*',
      input: `node_modules/pdfjs-dist/${folder}`,
      output: `${PDFJS_OUTPUT}/${folder}`,
    })),
  ];
}

/**
 * `ng add @minawk/pdf-viewer-ng`: installs pdf.js, copies its files into the build,
 * registers `providePdfViewer()` and, optionally, the built-in themes. Safe to run again.
 */
export function ngAdd(ngAddOptions: NgAddOptions): Rule {
  return async (tree: Tree) => {
    const workspace = await readWorkspace(tree);
    const projectName =
      ngAddOptions.project ??
      [...workspace.projects.entries()].find(
        ([, project]) => project.extensions['projectType'] === 'application',
      )?.[0];
    const project = projectName ? workspace.projects.get(projectName) : undefined;
    if (!projectName || !project || project.extensions['projectType'] !== 'application') {
      throw new SchematicsException(
        `No Angular application named "${ngAddOptions.project ?? ''}" in this workspace: use --project <name>.`,
      );
    }
    if (!project.targets.get('build')) {
      throw new SchematicsException(`The project "${projectName}" has no build target.`);
    }

    return chain([
      addDependency('pdfjs-dist', PDFJS_VERSION_RANGE, {
        type: DependencyType.Default,
        existing: ExistingBehavior.Skip,
      }),
      updateWorkspace((workspace) => {
        const build = workspace.projects.get(projectName)!.targets.get('build')!;
        build.options ??= {};
        addAssets(build.options, pdfjsAssets(ngAddOptions.pdfjsFiles));
        if (ngAddOptions.themes) {
          addStylesheet(build.options, THEMES_STYLESHEET);
        }
      }),
      // Angular's addRootProvider() does not check for an existing call: running again must not duplicate it.
      usesProvider(tree, project.sourceRoot ?? `${project.root}/src`)
        ? noop()
        : addRootProvider(projectName, ({ code, external }) =>
            ngAddOptions.pdfjsFiles
              ? code`${external('providePdfViewer', '@minawk/pdf-viewer-ng')}({ assetsUrl: '${PDFJS_OUTPUT}/' })`
              : code`${external('providePdfViewer', '@minawk/pdf-viewer-ng')}()`,
          ),
      (_: Tree, context: SchematicContext) => {
        context.logger.info(
          [
            '',
            '@minawk/pdf-viewer-ng is ready. Use it in a component:',
            '',
            "  import { PdfViewer } from '@minawk/pdf-viewer-ng';",
            '  <pdfv-viewer src="assets/document.pdf" />',
            '',
            'Give the viewer a height (it fills its container). Documentation: README of @minawk/pdf-viewer-ng.',
          ].join('\n'),
        );
      },
    ]);
  };
}

/** Whether a source file of the application already calls `providePdfViewer()`. */
function usesProvider(tree: Tree, sourceRoot: string): boolean {
  let found = false;
  tree.getDir(sourceRoot).visit((file) => {
    if (!found && file.endsWith('.ts') && !file.endsWith('.spec.ts')) {
      found = tree.readText(file).includes('providePdfViewer(');
    }
  });
  return found;
}

/** Assets entries, unless an identical one is already configured. */
function addAssets(options: Record<string, unknown>, entries: readonly AssetEntry[]): void {
  const assets = (Array.isArray(options['assets']) ? options['assets'] : []) as unknown[];
  for (const entry of entries) {
    const exists = assets.some(
      (asset) =>
        typeof asset === 'object' &&
        asset !== null &&
        (asset as AssetEntry).input === entry.input &&
        (asset as AssetEntry).glob === entry.glob,
    );
    if (!exists) {
      assets.push({ ...entry });
    }
  }
  options['assets'] = assets as never;
}

function addStylesheet(options: Record<string, unknown>, stylesheet: string): void {
  const styles = (Array.isArray(options['styles']) ? options['styles'] : []) as unknown[];
  const exists = styles.some(
    (style) =>
      (typeof style === 'string' ? style : (style as { input?: string })?.input) === stylesheet,
  );
  if (!exists) {
    styles.push(stylesheet);
  }
  options['styles'] = styles as never;
}
