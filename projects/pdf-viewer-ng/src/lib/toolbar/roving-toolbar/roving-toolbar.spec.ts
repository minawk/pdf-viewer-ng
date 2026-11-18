import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RovingToolbar, ToolbarItem } from './roving-toolbar';

@Component({
  imports: [RovingToolbar, ToolbarItem],
  template: `
    <div pdfvRovingToolbar aria-label="Test toolbar">
      <button type="button" pdfvToolbarItem id="a">A</button>
      <button type="button" pdfvToolbarItem id="b" [disabled]="bDisabled()">B</button>
      <input pdfvToolbarItem id="c" value="12" aria-label="C" />
      <button type="button" pdfvToolbarItem id="d">D</button>
    </div>
  `,
})
class Host {
  readonly bDisabled = signal(true);
}

describe('RovingToolbar', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLElement;
    const press = async (target: HTMLElement, key: string) => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await fixture.whenStable();
    };
    return { fixture, el, press };
  }

  it('sets the toolbar role and a single tab stop on the first enabled item', async () => {
    const { fixture, el } = await setup();
    expect(fixture.nativeElement.querySelector('[pdfvRovingToolbar]').getAttribute('role')).toBe(
      'toolbar',
    );
    expect(el('a').tabIndex).toBe(0);
    expect(el('b').tabIndex).toBe(-1);
    expect(el('d').tabIndex).toBe(-1);
    expect(el('b').getAttribute('aria-disabled')).toBe('true');
  });

  it('moves focus with the arrow keys, skipping disabled items and wrapping', async () => {
    const { el, press } = await setup();
    el('a').focus();
    await press(el('a'), 'ArrowRight');
    expect(document.activeElement).toBe(el('c'));
    expect(el('c').tabIndex).toBe(0);
    expect(el('a').tabIndex).toBe(-1);

    await press(el('a'), 'ArrowLeft');
    expect(document.activeElement).toBe(el('d'));
  });

  it('supports Home and End', async () => {
    const { el, press } = await setup();
    el('a').focus();
    await press(el('a'), 'End');
    expect(document.activeElement).toBe(el('d'));
    await press(el('d'), 'Home');
    expect(document.activeElement).toBe(el('a'));
  });

  it('keeps arrow keys inside a text field until the caret reaches its edge', async () => {
    const { el, press } = await setup();
    const input = el('c') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(1, 1);
    await press(input, 'ArrowRight');
    expect(document.activeElement).toBe(input);

    input.setSelectionRange(2, 2);
    await press(input, 'ArrowRight');
    expect(document.activeElement).toBe(el('d'));
  });

  it('includes items once they become enabled', async () => {
    const { fixture, el, press } = await setup();
    fixture.componentInstance.bDisabled.set(false);
    await fixture.whenStable();
    el('a').focus();
    await press(el('a'), 'ArrowRight');
    expect(document.activeElement).toBe(el('b'));
  });
});
