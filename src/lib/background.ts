import type { RGB } from './color';

export function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 불러오지 못했습니다.'));
    };
    img.src = url;
  });
}

export function imageToCanvas(img: HTMLImageElement, maxSide = 768): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

export type RemovalMode = 'ai' | 'fast';
export type ProgressFn = (fraction: number) => void;

const MODEL = 'isnet_quint8' as const;

function pickDevice(): 'cpu' | 'gpu' {
  return typeof navigator !== 'undefined' && 'gpu' in navigator ? 'gpu' : 'cpu';
}

function imglyConfig(device: 'cpu' | 'gpu', onProgress?: ProgressFn) {
  return {
    model: MODEL,
    device,
    output: { format: 'image/png' as const },
    progress: onProgress
      ? (_key: string, current: number, total: number) =>
          onProgress(total ? current / total : 0)
      : undefined,
  };
}

let preloadStarted = false;

export async function preloadBackgroundModel(): Promise<void> {
  if (preloadStarted) return;
  preloadStarted = true;
  try {
    const { preload } = await import('@imgly/background-removal');
    await preload(imglyConfig(pickDevice()));
  } catch (err) {
    preloadStarted = false;
    console.warn('모델 프리로드 실패', err);
  }
}

export async function removeBackground(
  canvas: HTMLCanvasElement,
  mode: RemovalMode = 'fast',
  onProgress?: ProgressFn,
): Promise<HTMLCanvasElement> {
  if (mode === 'ai') {
    try {
      return await aiRemove(canvas, onProgress);
    } catch (err) {
      console.warn('AI 배경 제거 실패, 빠른 방식으로 폴백합니다.', err);
    }
  }
  return fastCharacterCutout(canvas);
}

async function aiRemove(
  canvas: HTMLCanvasElement,
  onProgress?: ProgressFn,
): Promise<HTMLCanvasElement> {
  const { removeBackground: imglyRemove } = await import('@imgly/background-removal');
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob 실패'))), 'image/png'),
  );

  const device = pickDevice();
  let resultBlob: Blob;
  try {
    resultBlob = await imglyRemove(blob, imglyConfig(device, onProgress));
  } catch (err) {
    if (device === 'gpu') {
      console.warn('GPU 추론 실패, CPU로 재시도합니다.', err);
      resultBlob = await imglyRemove(blob, imglyConfig('cpu', onProgress));
    } else {
      throw err;
    }
  }

  const url = URL.createObjectURL(resultBlob);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    out.getContext('2d')!.drawImage(img, 0, 0, out.width, out.height);
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Component {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerScore: number;
}

function fastCharacterCutout(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const bg = estimateBackground(d, w, h);
  const candidate = new Uint8Array(w * h);
  const centerX = (w - 1) / 2;
  const centerY = (h - 1) / 2;
  const maxRadius = Math.hypot(centerX, centerY);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      const bgDist = colorDistance([d[i], d[i + 1], d[i + 2]], bg.color);
      const centerBias = 1 - Math.min(1, Math.hypot(x - centerX, y - centerY) / maxRadius);
      const localEdge = edgeStrength(d, w, h, x, y);
      const score = bgDist - bg.threshold + centerBias * 34 + localEdge * 0.45;
      candidate[p] = score > 0 ? 1 : 0;
    }
  }

  const keep = pickCharacterComponents(candidate, w, h);
  if (!keep) return floodFillRemove(canvas);

  for (let p = 0; p < keep.length; p++) {
    d[p * 4 + 3] = keep[p] ? 255 : 0;
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

function estimateBackground(data: Uint8ClampedArray, w: number, h: number): {
  color: RGB;
  threshold: number;
} {
  const samples: RGB[] = [];
  const stride = Math.max(1, Math.floor(Math.min(w, h) / 48));

  for (let x = 0; x < w; x += stride) {
    samples.push(readRgb(data, w, x, 0), readRgb(data, w, x, h - 1));
  }
  for (let y = 0; y < h; y += stride) {
    samples.push(readRgb(data, w, 0, y), readRgb(data, w, w - 1, y));
  }

  const color = averageColor(samples);
  const distances = samples.map((sample) => colorDistance(sample, color));
  const mean = distances.reduce((sum, n) => sum + n, 0) / Math.max(1, distances.length);
  const variance =
    distances.reduce((sum, n) => sum + (n - mean) * (n - mean), 0) /
    Math.max(1, distances.length);

  return {
    color,
    threshold: clamp(mean + Math.sqrt(variance) * 1.25 + 26, 38, 96),
  };
}

function pickCharacterComponents(mask: Uint8Array, w: number, h: number): Uint8Array | null {
  const visited = new Uint8Array(w * h);
  const labels = new Int32Array(w * h);
  labels.fill(-1);

  const components: Component[] = [];
  const stack: number[] = [];
  const centerX = (w - 1) / 2;
  const centerY = (h - 1) / 2;
  const maxRadius = Math.hypot(centerX, centerY);

  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || visited[p]) continue;

    const label = components.length;
    const component: Component = {
      area: 0,
      minX: w,
      minY: h,
      maxX: 0,
      maxY: 0,
      centerScore: 0,
    };

    stack.push(p);
    visited[p] = 1;

    while (stack.length) {
      const cur = stack.pop()!;
      const x = cur % w;
      const y = Math.floor(cur / w);

      labels[cur] = label;
      component.area++;
      component.minX = Math.min(component.minX, x);
      component.minY = Math.min(component.minY, y);
      component.maxX = Math.max(component.maxX, x);
      component.maxY = Math.max(component.maxY, y);
      component.centerScore += 1 - Math.min(1, Math.hypot(x - centerX, y - centerY) / maxRadius);

      pushNeighbor(cur - 1, x > 0);
      pushNeighbor(cur + 1, x < w - 1);
      pushNeighbor(cur - w, y > 0);
      pushNeighbor(cur + w, y < h - 1);
    }

    components.push(component);
  }

  if (!components.length) return null;

  const minMainArea = Math.max(24, w * h * 0.008);
  let mainIndex = -1;
  let bestScore = -1;
  for (let i = 0; i < components.length; i++) {
    const c = components[i];
    if (c.area < minMainArea) continue;
    const score = c.area * (0.75 + c.centerScore / c.area);
    if (score > bestScore) {
      bestScore = score;
      mainIndex = i;
    }
  }

  if (mainIndex < 0) return null;

  const main = components[mainIndex];
  const pad = Math.round(Math.max(w, h) * 0.08);
  const keep = new Uint8Array(w * h);

  for (let p = 0; p < labels.length; p++) {
    const label = labels[p];
    if (label < 0) continue;
    const c = components[label];
    const isMain = label === mainIndex;
    const isNearby =
      c.area >= Math.max(8, main.area * 0.012) &&
      c.maxX >= main.minX - pad &&
      c.minX <= main.maxX + pad &&
      c.maxY >= main.minY - pad &&
      c.minY <= main.maxY + pad;

    keep[p] = isMain || isNearby ? 1 : 0;
  }

  closeTinyHoles(keep, w, h);
  return keep;

  function pushNeighbor(next: number, valid: boolean) {
    if (!valid || visited[next] || !mask[next]) return;
    visited[next] = 1;
    stack.push(next);
  }
}

function closeTinyHoles(mask: Uint8Array, w: number, h: number) {
  const copy = mask.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (copy[p]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          n += copy[(y + dy) * w + x + dx];
        }
      }
      if (n >= 6) mask[p] = 1;
    }
  }
}

function floodFillRemove(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const visited = new Uint8Array(w * h);
  const tolerance = 38 * 38 * 3;

  const seeds = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];

  const stack: number[] = [];
  for (const [sx, sy] of seeds) {
    const ref = readRgb(d, w, sx, sy);
    stack.push(sx, sy);
    while (stack.length) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const p = y * w + x;
      if (visited[p]) continue;
      const i = p * 4;
      const dist = squaredColorDistance([d[i], d[i + 1], d[i + 2]], ref);
      if (dist > tolerance) continue;
      visited[p] = 1;
      d[i + 3] = 0;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

function readRgb(data: Uint8ClampedArray, w: number, x: number, y: number): RGB {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function averageColor(colors: RGB[]): RGB {
  const sum = colors.reduce(
    (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]],
    [0, 0, 0],
  );
  const n = Math.max(1, colors.length);
  return [
    Math.round(sum[0] / n),
    Math.round(sum[1] / n),
    Math.round(sum[2] / n),
  ];
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt(squaredColorDistance(a, b));
}

function squaredColorDistance(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function edgeStrength(data: Uint8ClampedArray, w: number, h: number, x: number, y: number): number {
  if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) return 0;
  const p = (y * w + x) * 4;
  const right = (y * w + x + 1) * 4;
  const down = ((y + 1) * w + x) * 4;
  return (
    Math.abs(data[p] - data[right]) +
    Math.abs(data[p + 1] - data[right + 1]) +
    Math.abs(data[p + 2] - data[right + 2]) +
    Math.abs(data[p] - data[down]) +
    Math.abs(data[p + 1] - data[down + 1]) +
    Math.abs(data[p + 2] - data[down + 2])
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
