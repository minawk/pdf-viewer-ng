import { canvasPixelRatio, MAX_SCALE, MIN_SCALE, PDF_TO_CSS_UNITS, resolveScale } from './zoom';

describe('resolveScale', () => {
  const page = { width: 600, height: 800 };
  const container = { width: 1232, height: 832 };

  it('maps a numeric zoom to CSS pixels per point', () => {
    expect(resolveScale(1, page, container)).toBeCloseTo(PDF_TO_CSS_UNITS);
    expect(resolveScale(2, page, container)).toBeCloseTo(2 * PDF_TO_CSS_UNITS);
  });

  it('fits the page width, minus the gaps', () => {
    expect(resolveScale('fit-width', page, container, 16)).toBeCloseTo(2);
  });

  it('fits the whole page in the container', () => {
    expect(resolveScale('fit-page', page, container, 16)).toBeCloseTo(1);
  });

  it('uses the actual size before the container is measured', () => {
    expect(resolveScale('fit-width', page, { width: 0, height: 0 })).toBeCloseTo(PDF_TO_CSS_UNITS);
  });

  it('clamps extreme values', () => {
    expect(resolveScale(100, page, container)).toBe(MAX_SCALE);
    expect(resolveScale(0.001, page, container)).toBe(MIN_SCALE);
  });
});

describe('canvasPixelRatio', () => {
  it('caps the device pixel ratio', () => {
    expect(canvasPixelRatio({ width: 800, height: 1000 }, 3, 2)).toBe(2);
    expect(canvasPixelRatio({ width: 800, height: 1000 }, 1, 2)).toBe(1);
  });

  it('keeps the canvas under the maximum area browsers support', () => {
    const ratio = canvasPixelRatio({ width: 4000, height: 5000 }, 2, 2);
    expect(4000 * 5000 * ratio * ratio).toBeLessThanOrEqual(16_777_216 + 1);
  });
});
