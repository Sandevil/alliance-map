import { toExternal, toInternal } from './coordinates';

describe('coordinates', () => {
  it('maps internal coordinates to external using configured anchors', () => {
    const external = toExternal(
      { x: 10, y: 20 },
      {
        anchorInternal: { x: 0, y: 0 },
        anchorExternal: { x: 532, y: 152 },
      },
    );

    expect(external).toEqual({ x: 542, y: 172 });
  });

  it('maps external coordinates back to internal', () => {
    const internal = toInternal(
      { x: 542, y: 172 },
      {
        anchorInternal: { x: 0, y: 0 },
        anchorExternal: { x: 532, y: 152 },
      },
    );

    expect(internal).toEqual({ x: 10, y: 20 });
  });
});
