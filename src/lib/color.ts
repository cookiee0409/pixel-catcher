export type RGB = [number, number, number];

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

/** 중앙값 분할(median cut)로 대표 색 K개(=2^depth)를 추출한다. */
export function medianCut(pixels: RGB[], depth: number): RGB[] {
  if (pixels.length === 0) return [[0, 0, 0]];
  if (depth === 0 || pixels.length === 1) {
    const sum = pixels.reduce(
      (a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]] as RGB,
      [0, 0, 0] as RGB,
    );
    const n = pixels.length;
    return [[Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n)]];
  }
  const ranges = [0, 1, 2].map((c) => {
    let min = 255;
    let max = 0;
    for (const p of pixels) {
      if (p[c] < min) min = p[c];
      if (p[c] > max) max = p[c];
    }
    return max - min;
  });
  const ch = ranges.indexOf(Math.max(...ranges)) as 0 | 1 | 2;
  pixels.sort((a, b) => a[ch] - b[ch]);
  const mid = pixels.length >> 1;
  return [
    ...medianCut(pixels.slice(0, mid), depth - 1),
    ...medianCut(pixels.slice(mid), depth - 1),
  ];
}

export function nearestColorIndex(palette: RGB[], r: number, g: number, b: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = p[0] - r;
    const dg = p[1] - g;
    const db = p[2] - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}
