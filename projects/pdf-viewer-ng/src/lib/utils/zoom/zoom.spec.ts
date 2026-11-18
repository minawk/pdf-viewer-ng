import {
  canvasPixelRatio,
  clampZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  PDF_TO_CSS_UNITS,
  resolveScale,
  matchingPreset,
  stepZoom,
  zoomPercent,
} from './zoom';

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

  it('clamps numeric and fitted zooms to the bounds', () => {
    expect(resolveScale(100, page, container)).toBeCloseTo(MAX_ZOOM * PDF_TO_CSS_UNITS);
    expect(resolveScale(0.001, page, container)).toBeCloseTo(MIN_ZOOM * PDF_TO_CSS_UNITS);
    expect(resolveScale('fit-width', { width: 10, height: 10 }, container)).toBeCloseTo(
      MAX_ZOOM * PDF_TO_CSS_UNITS,
    );
  });
});

describe('zoom helpers', () => {
  it('clamps and sanitizes zoom factors', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('steps to the next preset level, from any level', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(1.249, 1)).toBe(1.5); // never a barely visible step
    expect(stepZoom(1.37, 1)).toBe(1.5);
    expect(stepZoom(1.37, -1)).toBe(1.25);
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });

  it('matches levels close to a preset', () => {
    expect(matchingPreset(1.99999)).toBe(2);
    expect(matchingPreset(1.371)).toBeUndefined();
  });

  it('formats percentages', () => {
    expect(zoomPercent(1.254)).toBe(125);
    expect(zoomPercent(0.1)).toBe(10);
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
