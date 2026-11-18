import { Component, computed, inject, input } from '@angular/core';
import { PDF_VIEWER_MESSAGES } from '../../core/messages';
import { PdfInteractionTool, PdfViewerTool } from '../../core/types';
import { ViewerStore } from '../../core/viewer-store/viewer-store';
import { FileActions } from '../../features/file-actions';
import { PrintService } from '../../features/print';
import { AnnotationStore } from '../../annotations/annotation-store/annotation-store';
import { SearchStore } from '../../search/search-store';
import { Icon } from '../../icon/icon';
import { PdfvIconName } from '../../icon/icons';
import { OverflowMenu, OverflowMenuItem } from '../overflow-menu/overflow-menu';
import { Pager } from '../pager/pager';
import { RovingToolbar, ToolbarItem } from '../roving-toolbar/roving-toolbar';
import { ZoomControl } from '../zoom-control/zoom-control';

/** Below this viewer width, secondary tools move into the "More tools" menu. */
export const COMPACT_TOOLBAR_WIDTH = 640;

/** Tools moved into the "More tools" menu in a compact toolbar. */
const SECONDARY_TOOLS: ReadonlySet<PdfViewerTool> = new Set([
  'interaction',
  'annotate',
  'open',
  'download',
  'print',
]);

interface ToolToggle {
  readonly tool: PdfInteractionTool;
  readonly icon: PdfvIconName;
  readonly label: string;
}

@Component({
  selector: 'pdfv-toolbar',
  imports: [Icon, OverflowMenu, Pager, ToolbarItem, ZoomControl],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
  hostDirectives: [RovingToolbar],
  host: { '[attr.aria-label]': 'messages.toolbarLabel' },
})
export class Toolbar {
  readonly tools = input.required<readonly PdfViewerTool[]>();

  protected readonly store = inject(ViewerStore);
  protected readonly search = inject(SearchStore);
  protected readonly files = inject(FileActions);
  protected readonly printer = inject(PrintService);
  private readonly annotations = inject(AnnotationStore);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);

  /** Narrow viewer: one or two rows of essential tools, the others in a menu. */
  protected readonly compact = computed(() => {
    const width = this.store.containerSize().width;
    return width > 0 && width < COMPACT_TOOLBAR_WIDTH;
  });

  /** Tools shown in the toolbar itself. */
  protected readonly inlineTools = computed(() =>
    this.compact() ? this.tools().filter((tool) => !SECONDARY_TOOLS.has(tool)) : this.tools(),
  );

  /** Items of the "More tools" menu, in the order of the `tools` input. */
  protected readonly menuItems = computed<readonly OverflowMenuItem[]>(() => {
    if (!this.compact()) {
      return [];
    }
    const noDocument = !this.store.hasDocument();
    const tool = this.store.tool();
    return this.tools().flatMap((name): OverflowMenuItem[] => {
      switch (name) {
        case 'interaction':
          return this.interactionTools.map((toggle) => ({
            id: toggle.tool,
            label: toggle.label,
            icon: toggle.icon,
            role: 'menuitemradio',
            checked: tool === toggle.tool,
            disabled: noDocument,
            action: () => this.store.setTool(toggle.tool),
          }));
        case 'annotate':
          return this.annotationTools.map((toggle) => ({
            id: toggle.tool,
            label: toggle.label,
            icon: toggle.icon,
            role: 'menuitemcheckbox',
            checked: tool === toggle.tool,
            disabled: noDocument,
            action: (event) => this.toggleAnnotationTool(toggle.tool, event),
          }));
        case 'open':
          return [
            {
              id: 'open',
              label: this.messages.open,
              icon: 'open',
              role: 'menuitem',
              action: () => this.files.pick(),
            },
          ];
        case 'download':
          return [
            {
              id: 'download',
              label: this.messages.download,
              icon: 'download',
              role: 'menuitem',
              disabled: noDocument,
              action: () => void this.files.download(),
            },
          ];
        case 'print':
          return [
            {
              id: 'print',
              label: this.messages.print,
              icon: 'print',
              role: 'menuitem',
              disabled: noDocument || this.printer.progress() !== null,
              action: () => void this.printer.print(),
            },
          ];
        default:
          return [];
      }
    });
  });

  protected readonly interactionTools: readonly ToolToggle[] = [
    { tool: 'select', icon: 'pointer', label: this.messages.selectTool },
    { tool: 'pan', icon: 'pan', label: this.messages.panTool },
  ];

  protected readonly annotationTools: readonly ToolToggle[] = [
    { tool: 'highlight', icon: 'highlight', label: this.messages.highlightTool },
    { tool: 'text', icon: 'text', label: this.messages.textTool },
  ];

  protected toggleSearch(): void {
    if (this.search.isOpen()) {
      this.search.close();
    } else {
      this.search.open();
    }
  }

  /**
   * Highlight: highlights the current text selection if there is one (the keyboard way),
   * else toggles the highlight tool. Text: toggles the text tool; activated from the keyboard,
   * it also adds a note in view right away, since there is no pointer to place it.
   */
  protected toggleAnnotationTool(
    tool: PdfInteractionTool,
    event: MouseEvent | KeyboardEvent,
  ): void {
    if (tool === 'highlight' && this.annotations.highlightSelection()) {
      return;
    }
    const active = this.store.tool() === tool;
    this.store.setTool(active ? 'select' : tool);
    // Keyboard activation: a keydown, or a click without pointer (detail 0).
    if (tool === 'text' && !active && (event instanceof KeyboardEvent || event.detail === 0)) {
      this.annotations.addTextNoteInView();
    }
  }
}
