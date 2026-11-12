import { describe, expect, it } from 'vitest';
import { detectRotation } from '../../src/domain/orientation';

const W = 440;
const H = 340;
function page(band: 'top' | 'bottom' | 'left' | 'right' | 'none'): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4).fill(255);
  const paint = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    px[i] = 120;
    px[i + 1] = 200;
    px[i + 2] = 235;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const fx = x / W;
      const fy = y / H;
      if (band === 'top' && fy > 0.14 && fy < 0.17 && fx > 0.08 && fx < 0.92) paint(x, y);
      if (band === 'bottom' && fy > 0.83 && fy < 0.86 && fx > 0.08 && fx < 0.92) paint(x, y);
      if (band === 'left' && fx > 0.14 && fx < 0.17 && fy > 0.08 && fy < 0.92) paint(x, y);
      if (band === 'right' && fx > 0.83 && fx < 0.86 && fy > 0.08 && fy < 0.92) paint(x, y);
    }
  return px;
}

describe('detectRotation', () => {
  it('reads an upright page as 0', () => expect(detectRotation(page('top'), W, H)).toMatchObject({ rotation: 0, confident: true }));
  it('reads an upside-down page as 180', () => expect(detectRotation(page('bottom'), W, H)).toMatchObject({ rotation: 180, confident: true }));
  it('reads top-at-left as 90 clockwise', () => expect(detectRotation(page('left'), W, H)).toMatchObject({ rotation: 90, confident: true }));
  it('reads top-at-right as 270 clockwise', () => expect(detectRotation(page('right'), W, H)).toMatchObject({ rotation: 270, confident: true }));
  it('is not confident on a page with no header band', () =>
    expect(detectRotation(page('none'), W, H)).toMatchObject({ rotation: 0, confident: false }));
});
