import { Component, computed, inject, input, resource } from '@angular/core';
import type { PDFPageProxy } from 'pdfjs-dist';
import { Box, normalizeRect, pdfRectToPercentBox } from '../../annotations/geometry/geometry';
import { PDF_VIEWER_MESSAGES } from '../../core/messages';
import { ViewerStore } from '../../core/viewer-store/viewer-store';
import {
  destinationPageIndex,
  opensInNewTab,
  pageLinks,
  PdfLink,
  readableUrl,
  textInRect,
} from '../links/links';

interface LinkView {
  readonly id: number;
  /** Position on the page, in percentages of the page size. */
  readonly box: Box;
  readonly label: string;
  readonly url?: string;
  readonly newTab: boolean;
  readonly dest?: PdfLink['dest'];
}

/**
 * The links of a page, as real `<a>` elements over the text: web, email and phone links of
 * the document, and links to other places of the document. Reachable with Tab and named after
 * the text under them.
 */
@Component({
  selector: 'pdfv-link-layer',
  templateUrl: './link-layer.html',
  styleUrl: './link-layer.scss',
})
export class LinkLayer {
  readonly page = input.required<PDFPageProxy>();

  private readonly store = inject(ViewerStore);
  private readonly messages = inject(PDF_VIEWER_MESSAGES);

  private readonly linksResource = resource({
    params: () => this.page(),
    loader: async ({ params: page }) => {
      const [annotations, content] = await Promise.all([
        page.getAnnotations({ intent: 'display' }),
        this.store.getTextContent(page.pageNumber).catch(() => ({ items: [] })),
      ]);
      const viewport = page.getViewport({ scale: 1 });
      return pageLinks(annotations).map((link, id): LinkView => {
        const text = textInRect(content, link.rect);
        const box = pdfRectToPercentBox(viewport, normalizeRect(link.rect));
        if (link.url) {
          const newTab = opensInNewTab(link.url);
          const label = text || readableUrl(link.url);
          return {
            id,
            box,
            url: link.url,
            newTab,
            label: newTab ? this.messages.externalLink(label) : label,
          };
        }
        return {
          id,
          box,
          dest: link.dest,
          newTab: false,
          label: text || this.messages.documentLink,
        };
      });
    },
  });

  protected readonly links = computed(() =>
    this.linksResource.hasValue() ? this.linksResource.value() : [],
  );

  /** Goes to the page an in-document link points to. */
  protected async follow(link: LinkView, event: Event): Promise<void> {
    event.preventDefault();
    const pdf = this.store.document();
    if (!pdf || !link.dest) {
      return;
    }
    const pageIndex = await destinationPageIndex(pdf, link.dest);
    if (pageIndex !== null) {
      this.store.goToPage(pageIndex + 1);
    }
  }
}
