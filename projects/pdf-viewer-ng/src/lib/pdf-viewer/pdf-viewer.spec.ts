import { TestBed } from '@angular/core/testing';
import { providePdfViewer } from '../core/config';
import { providePdfViewerMessages } from '../core/messages';
import { PdfViewer } from './pdf-viewer';

describe('PdfViewer', () => {
  beforeEach(() => {
    // The dev-mode "theme not loaded" hint is expected here: no theme stylesheet is loaded in tests.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  async function create() {
    const fixture = TestBed.createComponent(PdfViewer);
    await fixture.whenStable();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('uses the light theme by default', async () => {
    const { host } = await create();
    expect(host.getAttribute('data-pdfv-theme')).toBe('light');
  });

  it('uses the theme from providePdfViewer(), and the theme input wins over it', async () => {
    TestBed.configureTestingModule({ providers: [providePdfViewer({ theme: 'material' })] });
    const { fixture, host } = await create();
    expect(host.getAttribute('data-pdfv-theme')).toBe('material');

    fixture.componentRef.setInput('theme', 'ocean');
    await fixture.whenStable();
    expect(host.getAttribute('data-pdfv-theme')).toBe('ocean');
  });

  it('exposes labelled landmarks and a status live region', async () => {
    const { host } = await create();
    expect(host.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toBe('PDF viewer toolbar');
    const region = host.querySelector('[role="region"]');
    expect(region?.getAttribute('aria-label')).toBe('PDF document');
    expect(region?.getAttribute('tabindex')).toBe('0');
    expect(host.querySelector('[role="status"]')).not.toBeNull();
  });

  it('gives every toolbar button an accessible name', async () => {
    const { host } = await create();
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.getAttribute('aria-label')?.length).toBeGreaterThan(0);
    }
  });

  it('disables document actions while no document is loaded', async () => {
    const { host } = await create();
    const download = host.querySelector('button[aria-label="Download"]') as HTMLButtonElement;
    expect(download.getAttribute('aria-disabled')).toBe('true');
  });

  it('renders only the requested tools, and no toolbar for an empty list', async () => {
    const { fixture, host } = await create();
    fixture.componentRef.setInput('tools', ['print']);
    await fixture.whenStable();
    expect(host.querySelectorAll('[role="toolbar"] button').length).toBe(1);

    fixture.componentRef.setInput('tools', []);
    await fixture.whenStable();
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
  });

  it('uses overridden messages', async () => {
    TestBed.configureTestingModule({
      providers: [providePdfViewerMessages({ print: 'Imprimer', toolbarLabel: 'Barre d’outils' })],
    });
    const { host } = await create();
    expect(host.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toBe('Barre d’outils');
    expect(host.querySelector('button[aria-label="Imprimer"]')).not.toBeNull();
  });
});
