import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PdfViewerNg } from './pdf-viewer-ng';

describe('PdfViewerNg', () => {
  let component: PdfViewerNg;
  let fixture: ComponentFixture<PdfViewerNg>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PdfViewerNg],
    }).compileComponents();

    fixture = TestBed.createComponent(PdfViewerNg);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
