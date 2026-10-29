import {
  DEFAULT_PREPRINTED_LAYOUT,
  formFitProblem,
  resolvePreprintedLayout,
} from './preprinted-layout';

describe('resolvePreprintedLayout', () => {
  it('uses the standard layout when the series has none', () => {
    expect(resolvePreprintedLayout(null)).toEqual(DEFAULT_PREPRINTED_LAYOUT);
    expect(resolvePreprintedLayout('roto')).toEqual(DEFAULT_PREPRINTED_LAYOUT);
  });

  it('keeps what the series calibrated and completes the rest', () => {
    const layout = resolvePreprintedLayout({
      offsetX: 2.5,
      date: { x: 40, y: 'mal' },
      items: { maxLines: 14 },
    });

    expect(layout.offsetX).toBe(2.5);
    expect(layout.date).toEqual({ x: 40, y: DEFAULT_PREPRINTED_LAYOUT.date.y });
    expect(layout.items).toEqual({
      ...DEFAULT_PREPRINTED_LAYOUT.items,
      maxLines: 14,
    });
    expect(layout.total).toEqual(DEFAULT_PREPRINTED_LAYOUT.total);
  });
});

describe('formFitProblem', () => {
  const layout = {
    ...DEFAULT_PREPRINTED_LAYOUT,
    items: { ...DEFAULT_PREPRINTED_LAYOUT.items, maxLines: 3 },
  };

  it('accepts as many items as lines', () => {
    expect(formFitProblem(layout, 3)).toBeNull();
  });

  it('explains when the items do not fit on the sheet', () => {
    expect(formFitProblem(layout, 4)).toMatch(
      /tiene 4 ítems y la hoja del talonario admite 3/,
    );
  });
});
