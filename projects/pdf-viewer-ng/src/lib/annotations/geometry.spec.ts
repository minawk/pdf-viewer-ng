import {
  boxToPdfRect,
  containsPoint,
  hexToRgb,
  mergeLineBoxes,
  pdfRectToPercentBox,
  serializeAnnotation,
  ViewportLike,
} from './geometry';

/** An unrotated letter page at `scale`: PDF y goes up, viewport y goes down. */
function viewport(scale = 1): ViewportLike {
  const height = 792;
  return {
    width: 612 * scale,
    height: height * scale,
    convertToPdfPoint: (x, y) => [x / scale, height - y / scale],
    convertToViewportPoint: (x, y) => [x * scale, (height - y) * scale],
  };
}

describe('mergeLineBoxes', () => {
  it('merges the runs of a line and keeps lines apart', () => {
    const lines = mergeLineBoxes([
      { left: 10, top: 100, right: 60, bottom: 114 },
      { left: 60, top: 101, right: 120, bottom: 114 },
      { left: 10, top: 112, right: 80, bottom: 126 },
    ]);
    expect(lines).toEqual([
      { left: 10, top: 100, right: 120, bottom: 113 },
      { left: 10, top: 113, right: 80, bottom: 126 },
    ]);
  });

  it('ignores empty rectangles', () => {
    expect(mergeLineBoxes([{ left: 5, top: 5, right: 5, bottom: 20 }])).toEqual([]);
  });
});

describe('coordinates', () => {
  it('converts viewport boxes to PDF rectangles and back, at any zoom', () => {
    const rect = boxToPdfRect(viewport(2), { left: 200, top: 400, right: 300, bottom: 440 });
    expect(rect).toEqual([100, 572, 150, 592]);
    const box = pdfRectToPercentBox(viewport(1), rect);
    expect(box.left).toBeCloseTo((100 * 100) / 612);
    expect(box.top).toBeCloseTo((100 * 200) / 792);
    expect(box.bottom).toBeCloseTo((100 * 220) / 792);
  });

  it('tests points against rectangles', () => {
    expect(containsPoint([0, 0, 10, 10], 5, 5)).toBe(true);
    expect(containsPoint([0, 0, 10, 10], 11, 5)).toBe(false);
  });

  it('converts colors like pdf.js', () => {
    expect(hexToRgb('#ff4f5f')).toEqual([255, 79, 95]);
  });
});

describe('serializeAnnotation', () => {
  it('serializes highlights like the pdf.js highlight editor', () => {
    const serialized = serializeAnnotation({
      id: 'a',
      type: 'highlight',
      page: 2,
      color: '#ffff98',
      text: 'hello',
      rects: [
        [10, 700, 100, 712],
        [10, 686, 60, 700],
      ],
    });
    expect(serialized).toMatchObject({
      annotationType: 9,
      pageIndex: 1,
      rect: [10, 686, 100, 712],
      color: [255, 255, 152],
      opacity: 1,
      quadPoints: [10, 712, 100, 712, 10, 700, 100, 700, 10, 700, 60, 700, 10, 686, 60, 686],
    });
    expect(serialized['outlines']).toHaveLength(2);
  });

  it('serializes text notes like the pdf.js free text editor', () => {
    expect(
      serializeAnnotation({
        id: 'b',
        type: 'text',
        page: 1,
        color: '#c62828',
        text: 'Note\nline 2',
        fontSize: 14,
        rect: [50, 600, 150, 640],
      }),
    ).toEqual({
      annotationType: 3,
      pageIndex: 0,
      rect: [50, 600, 150, 640],
      rotation: 0,
      color: [198, 40, 40],
      fontSize: 14,
      value: 'Note\nline 2',
    });
  });
});
