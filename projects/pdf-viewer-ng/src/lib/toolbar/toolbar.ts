import { Component, inject, input } from '@angular/core';
import { PDF_VIEWER_MESSAGES } from '../core/messages';
import { PdfInteractionTool, PdfViewerTool } from '../core/types';
import { ViewerStore } from '../core/viewer-store';
import { Icon } from '../icon/icon';
import { PdfvIconName } from '../icon/icons';
import { RovingToolbar, ToolbarItem } from './roving-toolbar';

interface ToolToggle {
  readonly tool: PdfInteractionTool;
  readonly icon: PdfvIconName;
  readonly label: string;
}

@Component({
  selector: 'pdfv-toolbar',
  imports: [Icon, ToolbarItem],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
  hostDirectives: [RovingToolbar],
  host: { '[attr.aria-label]': 'messages.toolbarLabel' },
})
export class Toolbar {
  readonly tools = input.required<readonly PdfViewerTool[]>();

  protected readonly store = inject(ViewerStore);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);

  protected readonly zoomPresets = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

  protected readonly interactionTools: readonly ToolToggle[] = [
    { tool: 'select', icon: 'pointer', label: this.messages.selectTool },
    { tool: 'pan', icon: 'pan', label: this.messages.panTool },
  ];

  protected readonly annotationTools: readonly ToolToggle[] = [
    { tool: 'highlight', icon: 'highlight', label: this.messages.highlightTool },
    { tool: 'text', icon: 'text', label: this.messages.textTool },
  ];

  protected toggleAnnotationTool(tool: PdfInteractionTool): void {
    this.store.setTool(this.store.tool() === tool ? 'select' : tool);
  }
}
