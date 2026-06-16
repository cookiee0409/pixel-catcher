import { medianCut, nearestColorIndex, rgbToHsl } from './color';
import type { RGB } from './color';
import { attributeFromColor } from './attributes';
import type { Attribute } from '../types';

const ALPHA_CUTOFF = 128;
const OUTLINE: RGB = [42, 32, 38]; // 따뜻한 다크 톤 외곽선

export interface PixelResult {
  /** 화면 표시용 업스케일 캔버스 (투명 배경, 선명한 픽셀) */
  display: HTMLCanvasElement;
  resolution: number;
  attribute: Attribute;
}

/**
 * 배경이 제거된 캔버스에서 대상의 바운딩 박스를 찾아
 * 약간의 여백을 둔 정사각형 캔버스 중앙에 배치한다.
 */
export function prepareSubject(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext('2d')!;
  const { width: w, height: h } = src;
  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] >= ALPHA_CUTOFF) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // 대상을 못 찾으면 원본 전체 사용
  if (maxX < 0) {
    minX = 0;
    minY = 0;
    maxX = w - 1;
    maxY = h - 1;
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const side = Math.round(Math.max(cropW, cropH) * 1.16); // 약 8% 여백
  const out = document.createElement('canvas');
  out.width = side;
  out.height = side;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = true;
  octx.drawImage(
    src,
    minX,
    minY,
    cropW,
    cropH,
    Math.round((side - cropW) / 2),
    Math.round((side - cropH) / 2),
    cropW,
    cropH,
  );
  return out;
}

/**
 * 정사각 대상 캔버스를 NxN 픽셀로 변환:
 * 다운스케일 → 색상 감축(median cut) → 외곽선 → 업스케일.
 */
export function pixelate(
  subject: HTMLCanvasElement,
  resolution: number,
  colorDepth: number,
  displaySize = 480,
): PixelResult {
  const N = resolution;

  // 1) 평균색을 살리며 NxN 으로 축소
  const small = document.createElement('canvas');
  small.width = N;
  small.height = N;
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(subject, 0, 0, N, N);

  const img = sctx.getImageData(0, 0, N, N);
  const px = img.data;

  // 2) 불투명 픽셀 수집 → 팔레트 생성
  const opaque: RGB[] = [];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] >= ALPHA_CUTOFF) opaque.push([px[i], px[i + 1], px[i + 2]]);
  }
  const palette = medianCut(opaque.slice(), Math.max(1, colorDepth));
  const counts = new Array(palette.length).fill(0);

  // 3) 각 픽셀을 팔레트로 양자화하고 알파를 이진화
  const mask = new Uint8Array(N * N); // 1 = 불투명
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    if (px[i + 3] >= ALPHA_CUTOFF) {
      const idx = nearestColorIndex(palette, px[i], px[i + 1], px[i + 2]);
      const c = palette[idx];
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
      counts[idx]++;
      mask[p] = 1;
    } else {
      px[i + 3] = 0;
      mask[p] = 0;
    }
  }

  // 4) 외곽선: 투명하지만 불투명 픽셀과 인접한 칸을 어둡게 채운다
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = y * N + x;
      if (mask[p]) continue;
      let neighbor = false;
      for (let dy = -1; dy <= 1 && !neighbor; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          if (mask[ny * N + nx]) {
            neighbor = true;
            break;
          }
        }
      }
      if (neighbor) {
        const i = p * 4;
        px[i] = OUTLINE[0];
        px[i + 1] = OUTLINE[1];
        px[i + 2] = OUTLINE[2];
        px[i + 3] = 255;
      }
    }
  }

  sctx.putImageData(img, 0, 0);

  // 5) 대표 색 → 속성 결정 (채도 있는 가장 흔한 색 우선)
  const attribute = pickAttribute(palette, counts);

  // 6) 선명하게 업스케일
  const scale = Math.max(1, Math.floor(displaySize / N));
  const display = document.createElement('canvas');
  display.width = N * scale;
  display.height = N * scale;
  const dctx = display.getContext('2d')!;
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(small, 0, 0, display.width, display.height);

  return { display, resolution: N, attribute };
}

function pickAttribute(palette: RGB[], counts: number[]): Attribute {
  let bestColor: RGB = palette[0] ?? [128, 128, 128];
  let bestScore = -1;
  for (let i = 0; i < palette.length; i++) {
    const [, s] = rgbToHsl(...palette[i]);
    // 빈도 × (채도 가중) — 무채색 배경/외곽이 속성을 좌우하지 않도록
    const score = counts[i] * (0.25 + s);
    if (score > bestScore) {
      bestScore = score;
      bestColor = palette[i];
    }
  }
  const [h, s, l] = rgbToHsl(...bestColor);
  return attributeFromColor(h, s, l);
}
