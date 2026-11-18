import {
  afterRenderEffect,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { PDF_VIEWER_MESSAGES } from '../../core/messages';
import { Icon } from '../../icon/icon';
import { PdfvIconName } from '../../icon/icons';
import { ToolbarItem } from '../roving-toolbar/roving-toolbar';

export interface OverflowMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon: PdfvIconName;
  /** `menuitemcheckbox` / `menuitemradio` items report their state with `checked`. */
  readonly role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio';
  readonly checked?: boolean;
  readonly disabled?: boolean;
  /** Runs after the menu closed and focus went back to the menu button. */
  readonly action: (event: MouseEvent | KeyboardEvent) => void;
}

let nextId = 0;

/**
 * "More tools" menu button of the compact toolbar, following the WAI-ARIA menu button pattern:
 * https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/
 */
@Component({
  selector: 'pdfv-overflow-menu',
  imports: [Icon, ToolbarItem],
  templateUrl: './overflow-menu.html',
  styleUrl: './overflow-menu.scss',
})
export class OverflowMenu {
  readonly items = input.required<readonly OverflowMenuItem[]>();

  protected readonly messages = inject(PDF_VIEWER_MESSAGES);
  protected readonly menuId = `pdfv-menu-${nextId++}`;
  protected readonly isOpen = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('button');
  /** Item to focus once the menu is rendered: first or last. */
  private initialFocus: 'first' | 'last' = 'first';

  constructor() {
    const document = inject(DOCUMENT);
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (this.isOpen() && !this.host.contains(event.target as Node)) {
        this.isOpen.set(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePress, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('pointerdown', closeOnOutsidePress, true));

    afterRenderEffect(() => {
      if (this.isOpen()) {
        untracked(() => {
          const items = this.menuItems();
          (this.initialFocus === 'first' ? items[0] : items[items.length - 1])?.focus();
        });
      }
    });
  }

  protected toggle(): void {
    this.initialFocus = 'first';
    this.isOpen.update((open) => !open);
  }

  protected onButtonKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation(); // not toolbar navigation
      this.initialFocus = event.key === 'ArrowDown' ? 'first' : 'last';
      this.isOpen.set(true);
    }
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = this.menuItems();
    const index = items.indexOf(event.target as HTMLElement);
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        next = (index + 1) % items.length;
        break;
      case 'ArrowUp':
        next = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      case 'Escape':
        this.close();
        break;
      case 'Tab':
        this.isOpen.set(false); // focus moves on naturally
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (next !== null) {
      items[next]?.focus();
    }
  }

  protected activate(item: OverflowMenuItem, event: MouseEvent | KeyboardEvent): void {
    if (item.disabled) {
      return;
    }
    this.close();
    item.action(event);
  }

  private close(): void {
    this.isOpen.set(false);
    this.button().nativeElement.focus();
  }

  private menuItems(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
  }
}
