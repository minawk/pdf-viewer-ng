import {
  booleanAttribute,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  Signal,
  signal,
} from '@angular/core';

/**
 * WAI-ARIA toolbar pattern: the toolbar is a single tab stop, and the arrow keys
 * (plus Home/End) move focus between its enabled items.
 * https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/
 */
@Directive({
  selector: '[pdfvRovingToolbar]',
  host: {
    role: 'toolbar',
    'aria-orientation': 'horizontal',
    '(keydown)': 'onKeydown($event)',
    '(focusin)': 'onFocusin($event)',
  },
})
export class RovingToolbar {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly items = signal<readonly ToolbarItem[]>([]);
  private readonly active = signal<ToolbarItem | null>(null);

  /** The only item reachable with Tab: the last focused one, or else the first enabled one. */
  readonly tabStop: Signal<ToolbarItem | null> = computed(() => {
    const active = this.active();
    if (active && !active.disabled() && this.items().includes(active)) {
      return active;
    }
    return sortByDomOrder(this.items()).find((item) => !item.disabled()) ?? null;
  });

  register(item: ToolbarItem): void {
    this.items.update((items) => [...items, item]);
  }

  unregister(item: ToolbarItem): void {
    this.items.update((items) => items.filter((i) => i !== item));
    if (this.active() === item) {
      this.active.set(null);
    }
  }

  protected onFocusin(event: FocusEvent): void {
    const item = this.itemFor(event.target);
    if (item) {
      this.active.set(item);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey || !shouldMoveFocus(event)) {
      return;
    }
    const enabled = sortByDomOrder(this.items()).filter((item) => !item.disabled());
    const current = enabled.findIndex((item) => item.element.contains(event.target as Node));
    if (current === -1) {
      return;
    }
    const rtl = getComputedStyle(this.host).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    const last = enabled.length - 1;
    let next: number;
    switch (event.key) {
      case forward:
        next = current === last ? 0 : current + 1;
        break;
      case backward:
        next = current === 0 ? last : current - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = enabled[next];
    this.active.set(target);
    target.element.focus();
  }

  private itemFor(target: EventTarget | null): ToolbarItem | undefined {
    return this.items().find((item) => item.element.contains(target as Node));
  }
}

/**
 * Marks a focusable control (button, input, select) as an item of the enclosing toolbar.
 *
 * Disabled buttons use `aria-disabled` rather than `disabled`: they stay focusable, so pressing
 * "Next page" on the second to last page does not drop focus to the document body when the
 * button becomes disabled. Their clicks are blocked. Text fields and selects use `disabled`.
 */
@Directive({
  selector: '[pdfvToolbarItem]',
  host: {
    '[attr.tabindex]': 'tabIndex()',
    '[attr.disabled]': "disabled() && !isButton ? '' : null",
    '[attr.aria-disabled]': "isButton && disabled() ? 'true' : null",
  },
})
export class ToolbarItem {
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly isButton = this.element instanceof HTMLButtonElement;

  private readonly toolbar = inject(RovingToolbar);
  protected readonly tabIndex: Signal<number> = computed(() =>
    this.toolbar.tabStop() === this ? 0 : -1,
  );

  constructor() {
    this.toolbar.register(this);
    inject(DestroyRef).onDestroy(() => this.toolbar.unregister(this));
    if (this.isButton) {
      // Capture listeners on the target run before the template's (click) handlers.
      this.element.addEventListener(
        'click',
        (event) => {
          if (this.disabled()) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        },
        { capture: true },
      );
    }
  }
}

function sortByDomOrder(items: readonly ToolbarItem[]): ToolbarItem[] {
  return [...items].sort((a, b) =>
    a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
}

/**
 * Text fields and selects keep their native arrow-key behaviour. Focus leaves a
 * text field only when the caret is already at the edge it moves towards.
 */
function shouldMoveFocus(event: KeyboardEvent): boolean {
  const target = event.target;
  if (target instanceof HTMLSelectElement) {
    return false;
  }
  if (
    target instanceof HTMLInputElement &&
    target.type !== 'button' &&
    target.type !== 'checkbox'
  ) {
    const { selectionStart, selectionEnd, value } = target;
    if (selectionStart === null || selectionStart !== selectionEnd) {
      return false;
    }
    if (event.key === 'ArrowLeft') {
      return selectionStart === 0;
    }
    if (event.key === 'ArrowRight') {
      return selectionStart === value.length;
    }
    return false;
  }
  return true;
}
