import { Component, inject, input } from '@angular/core';
import { PDF_VIEWER_MESSAGES } from '../core/messages';
import { PdfInteractionTool, PdfViewerTool } from '../core/types';
import { ViewerStore } from '../core/viewer-store';
import { SearchStore } from '../search/search-store';
import { Icon } from '../icon/icon';
import { PdfvIconName } from '../icon/icons';
import { Pager } from './pager';
import { RovingToolbar, ToolbarItem } from './roving-toolbar';
import { ZoomControl } from './zoom-control';

interface ToolToggle {
  readonly tool: PdfInteractionTool;
  readonly icon: PdfvIconName;
  readonly label: string;
}

@Component({
  selector: 'pdfv-toolbar',
  imports: [Icon, Pager, ToolbarItem, ZoomControl],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
  hostDirectives: [RovingToolbar],
  host: { '[attr.aria-label]': 'messages.toolbarLabel' },
})
export class Toolbar {
  readonly tools = input.required<readonly PdfViewerTool[]>();

  protected readonly store = inject(ViewerStore);
  protected readonly search = inject(SearchStore);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);

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

  protected toggleAnnotationTool(tool: PdfInteractionTool): void {
    this.store.setTool(this.store.tool() === tool ? 'select' : tool);
  }
}
