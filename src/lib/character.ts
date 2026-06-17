import { attributeFromColor } from './attributes';
import { medianCut, nearestColorIndex, rgbToHsl, type RGB } from './color';
import type { Attribute } from '../types';

export type SubjectKind = 'auto' | 'cat' | 'dog' | 'person';
export type ResolvedSubjectKind = Exclude<SubjectKind, 'auto'>;
export type AccessoryKind = 'none' | 'hat' | 'collar' | 'bag';

export interface CharacterResult {
  display: HTMLCanvasElement;
  attribute: Attribute;
  subjectKind: ResolvedSubjectKind;
  accessory: AccessoryKind;
}

interface SubjectFeatures {
  primary: RGB;
  secondary: RGB;
  accent: RGB;
  secondaryRatio: number;
  accessory: AccessoryKind;
  aspect: number;
}

const SIZE = 32;
const OUTLINE: RGB = [43, 34, 40];
const EYE: RGB = [35, 29, 34];

export const SUBJECT_LABELS: Record<SubjectKind, string> = {
  auto: '자동',
  cat: '고양이',
  dog: '강아지',
  person: '사람',
};

export const ACCESSORY_LABELS: Record<AccessoryKind, string> = {
  none: '없음',
  hat: '모자',
  collar: '목장식',
  bag: '가방',
};

export function createCharacter(
  subject: HTMLCanvasElement,
  requestedKind: SubjectKind,
  resolution: number,
  displaySize = 480,
): CharacterResult {
  const features = analyzeSubject(subject);
  const subjectKind =
    requestedKind === 'auto' ? estimateSubjectKind(subject, features.aspect) : requestedKind;
  const sprite = renderTemplate(subjectKind, features);

  const small = document.createElement('canvas');
  small.width = resolution;
  small.height = resolution;
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(sprite, 0, 0, resolution, resolution);
  addResolutionDetails(small, subjectKind, features, resolution);

  const scale = Math.max(1, Math.floor(displaySize / resolution));
  const display = document.createElement('canvas');
  display.width = resolution * scale;
  display.height = resolution * scale;
  const dctx = display.getContext('2d')!;
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(small, 0, 0, display.width, display.height);

  const [h, s, l] = rgbToHsl(...features.primary);
  return {
    display,
    attribute: attributeFromColor(h, s, l),
    subjectKind,
    accessory: features.accessory,
  };
}

function analyzeSubject(subject: HTMLCanvasElement): SubjectFeatures {
  const ctx = subject.getContext('2d')!;
  const { width, height } = subject;
  const data = ctx.getImageData(0, 0, width, height).data;
  const pixels: RGB[] = [];
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      pixels.push([data[i], data[i + 1], data[i + 2]]);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!pixels.length) {
    return {
      primary: [154, 160, 166],
      secondary: [215, 205, 190],
      accent: [224, 137, 74],
      secondaryRatio: 0,
      accessory: 'none',
      aspect: 1,
    };
  }

  const palette = medianCut(pixels.slice(), 3);
  const counts = new Array(palette.length).fill(0);
  const positions = palette.map(() => ({ x: 0, y: 0 }));

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const index = nearestColorIndex(palette, data[i], data[i + 1], data[i + 2]);
      counts[index]++;
      positions[index].x += x;
      positions[index].y += y;
    }
  }

  const ranked = palette
    .map((color, index) => ({ color, count: counts[index], index }))
    .sort((a, b) => b.count - a.count);
  const primary = ranked[0]?.color ?? [154, 160, 166];
  const secondaryEntry =
    ranked.find((entry) => colorDistance(entry.color, primary) >= 42) ?? ranked[1] ?? ranked[0];
  const secondary = secondaryEntry?.color ?? lighten(primary, 34);
  const secondaryRatio = (secondaryEntry?.count ?? 0) / pixels.length;

  const accentEntry = ranked
    .filter((entry) => entry.count / pixels.length >= 0.015 && entry.count / pixels.length <= 0.24)
    .map((entry) => {
      const [, saturation] = rgbToHsl(...entry.color);
      return { ...entry, score: saturation * colorDistance(entry.color, primary) };
    })
    .sort((a, b) => b.score - a.score)[0];
  const accent = accentEntry?.color ?? lighten(secondary, 22);
  const accessory = detectAccessory(accentEntry, positions, counts, minX, minY, maxX, maxY);
  const boxW = Math.max(1, maxX - minX + 1);
  const boxH = Math.max(1, maxY - minY + 1);

  return { primary, secondary, accent, secondaryRatio, accessory, aspect: boxH / boxW };
}

function detectAccessory(
  accent: { index: number; score: number } | undefined,
  positions: Array<{ x: number; y: number }>,
  counts: number[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): AccessoryKind {
  if (!accent || accent.score < 22 || counts[accent.index] === 0) return 'none';
  const x = positions[accent.index].x / counts[accent.index];
  const y = positions[accent.index].y / counts[accent.index];
  const nx = (x - minX) / Math.max(1, maxX - minX);
  const ny = (y - minY) / Math.max(1, maxY - minY);

  if (ny < 0.3) return 'hat';
  if (ny < 0.58) return 'collar';
  if (nx < 0.3 || nx > 0.7) return 'bag';
  return 'none';
}

function estimateSubjectKind(subject: HTMLCanvasElement, aspect: number): ResolvedSubjectKind {
  if (aspect > 1.28) return 'person';

  const ctx = subject.getContext('2d')!;
  const { width, height } = subject;
  const data = ctx.getImageData(0, 0, width, height).data;
  let upperEdgeChanges = 0;
  let wasOpaque = false;
  const upperLimit = Math.max(1, Math.floor(height * 0.35));

  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 64))) {
    let opaque = false;
    for (let y = 0; y < upperLimit; y += 2) {
      if (data[(y * width + x) * 4 + 3] >= 128) {
        opaque = true;
        break;
      }
    }
    if (opaque !== wasOpaque) upperEdgeChanges++;
    wasOpaque = opaque;
  }

  return upperEdgeChanges >= 4 ? 'cat' : 'dog';
}

function renderTemplate(kind: ResolvedSubjectKind, features: SubjectFeatures): HTMLCanvasElement {
  const layers = {
    body: new Uint8Array(SIZE * SIZE),
    secondary: new Uint8Array(SIZE * SIZE),
    accent: new Uint8Array(SIZE * SIZE),
    detail: new Uint8Array(SIZE * SIZE),
  };

  if (kind === 'cat') drawCat(layers, features);
  if (kind === 'dog') drawDog(layers, features);
  if (kind === 'person') drawPerson(layers, features);
  drawAccessory(layers, kind, features.accessory);

  const occupied = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < occupied.length; i++) {
    occupied[i] = layers.body[i] || layers.secondary[i] || layers.accent[i] || layers.detail[i] ? 1 : 0;
  }

  const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const p = y * SIZE + x;
      let color: RGB | null = null;
      if (layers.body[p]) color = features.primary;
      if (layers.secondary[p]) color = features.secondary;
      if (layers.accent[p]) color = features.accent;
      if (layers.detail[p]) color = EYE;
      if (!color && touches(occupied, x, y)) color = OUTLINE;
      if (!color) continue;
      const i = p * 4;
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
      pixels[i + 3] = 255;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, SIZE, SIZE), 0, 0);
  return canvas;
}

type Layers = ReturnType<typeof emptyLayers>;
function emptyLayers() {
  return {
    body: new Uint8Array(SIZE * SIZE),
    secondary: new Uint8Array(SIZE * SIZE),
    accent: new Uint8Array(SIZE * SIZE),
    detail: new Uint8Array(SIZE * SIZE),
  };
}

function drawCat(layers: Layers, features: SubjectFeatures) {
  ellipse(layers.body, 16, 11, 7, 6);
  triangle(layers.body, [10, 7], [11, 2], [15, 7]);
  triangle(layers.body, [18, 7], [22, 2], [22, 8]);
  ellipse(layers.body, 16, 22, features.aspect < 0.85 ? 8 : 7, 8);
  rect(layers.body, 10, 23, 4, 7);
  rect(layers.body, 19, 23, 4, 7);
  line(layers.body, 22, 23, 28, 18, 2);
  line(layers.body, 28, 18, 27, 13, 2);
  ellipse(layers.secondary, 16, 13, 3, 2);
  if (features.secondaryRatio > 0.12) {
    ellipse(layers.secondary, 13, 20, 3, 3);
    rect(layers.secondary, 19, 23, 3, 3);
  }
  eyePair(layers.detail, 13, 18, 10);
  set(layers.accent, 16, 13);
  set(layers.detail, 15, 15);
  set(layers.detail, 17, 15);
}

function drawDog(layers: Layers, features: SubjectFeatures) {
  ellipse(layers.body, 16, 11, 7, 6);
  ellipse(layers.secondary, 8, 12, 3, 6);
  ellipse(layers.secondary, 24, 12, 3, 6);
  ellipse(layers.body, 16, 22, features.aspect < 0.85 ? 8 : 7, 8);
  rect(layers.body, 10, 23, 4, 7);
  rect(layers.body, 19, 23, 4, 7);
  line(layers.body, 22, 22, 28, 17, 2);
  ellipse(layers.secondary, 16, 14, 4, 3);
  if (features.secondaryRatio > 0.12) ellipse(layers.secondary, 13, 21, 3, 4);
  eyePair(layers.detail, 13, 18, 10);
  rect(layers.detail, 15, 13, 3, 2);
}

function drawPerson(layers: Layers, features: SubjectFeatures) {
  ellipse(layers.body, 16, 8, 5, 5);
  rect(layers.secondary, 11, 12, 10, 11);
  line(layers.secondary, 11, 14, 7, 22, 3);
  line(layers.secondary, 21, 14, 25, 22, 3);
  rect(layers.body, 11, 5, 10, 3);
  rect(layers.body, 12, 3, 8, 3);
  rect(layers.body, 11, 22, 4, 8);
  rect(layers.body, 18, 22, 4, 8);
  if (features.secondaryRatio > 0.15) rect(layers.accent, 11, 17, 10, 3);
  eyePair(layers.detail, 14, 18, 8);
  set(layers.detail, 16, 11);
}

function drawAccessory(layers: Layers, kind: ResolvedSubjectKind, accessory: AccessoryKind) {
  if (accessory === 'hat') {
    rect(layers.accent, kind === 'person' ? 11 : 10, 2, kind === 'person' ? 10 : 12, 2);
    rect(layers.accent, kind === 'person' ? 13 : 12, 0, kind === 'person' ? 6 : 8, 3);
  }
  if (accessory === 'collar') {
    rect(layers.accent, 11, kind === 'person' ? 12 : 16, 10, 2);
    if (kind !== 'person') set(layers.accent, 16, 18);
  }
  if (accessory === 'bag' && kind === 'person') {
    rect(layers.accent, 21, 16, 5, 7);
    line(layers.accent, 19, 12, 24, 17, 1);
  }
  if (accessory === 'bag' && kind !== 'person') {
    ellipse(layers.accent, 22, 22, 3, 4);
  }
}

function eyePair(mask: Uint8Array, leftX: number, rightX: number, y: number) {
  set(mask, leftX, y);
  set(mask, rightX, y);
}

function set(mask: Uint8Array, x: number, y: number) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  mask[y * SIZE + x] = 1;
}

function rect(mask: Uint8Array, x: number, y: number, w: number, h: number) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) set(mask, px, py);
  }
}

function ellipse(mask: Uint8Array, cx: number, cy: number, rx: number, ry: number) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry) <= 1) {
        set(mask, x, y);
      }
    }
  }
}

function triangle(mask: Uint8Array, a: [number, number], b: [number, number], c: [number, number]) {
  const minX = Math.floor(Math.min(a[0], b[0], c[0]));
  const maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
  const minY = Math.floor(Math.min(a[1], b[1], c[1]));
  const maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
  const area = edge(a, b, c);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p: [number, number] = [x, y];
      const w0 = edge(b, c, p);
      const w1 = edge(c, a, p);
      const w2 = edge(a, b, p);
      if ((area >= 0 && w0 >= 0 && w1 >= 0 && w2 >= 0) || (area < 0 && w0 <= 0 && w1 <= 0 && w2 <= 0)) {
        set(mask, x, y);
      }
    }
  }
}

function edge(a: [number, number], b: [number, number], p: [number, number]) {
  return (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
}

function line(mask: Uint8Array, x0: number, y0: number, x1: number, y1: number, width: number) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / Math.max(1, steps));
    const y = Math.round(y0 + ((y1 - y0) * i) / Math.max(1, steps));
    rect(mask, x - Math.floor(width / 2), y - Math.floor(width / 2), width, width);
  }
}

function touches(mask: Uint8Array, x: number, y: number) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && mask[ny * SIZE + nx]) return true;
    }
  }
  return false;
}

function colorDistance(a: RGB, b: RGB) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function lighten(color: RGB, amount: number): RGB {
  return [
    Math.min(255, color[0] + amount),
    Math.min(255, color[1] + amount),
    Math.min(255, color[2] + amount),
  ];
}

function addResolutionDetails(
  canvas: HTMLCanvasElement,
  kind: ResolvedSubjectKind,
  features: SubjectFeatures,
  resolution: number,
) {
  if (resolution < 48) return;
  const ctx = canvas.getContext('2d')!;
  const unit = resolution / SIZE;
  const dot = Math.max(1, Math.round(unit * 0.7));
  const paint = (color: RGB, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = rgbCss(color);
    ctx.fillRect(
      Math.round(x * unit),
      Math.round(y * unit),
      Math.max(dot, Math.round(w * unit)),
      Math.max(dot, Math.round(h * unit)),
    );
  };

  if (kind === 'cat') {
    paint(features.secondary, 11.5, 4, 1, 2);
    paint(features.secondary, 20, 4, 1, 2);
    paint([245, 240, 220], 13, 9.5);
    paint([245, 240, 220], 18, 9.5);
    paint(OUTLINE, 9, 13, 3, 0.6);
    paint(OUTLINE, 20, 13, 3, 0.6);
    paint(features.secondary, 12, 27, 2, 1);
    paint(features.secondary, 19, 27, 2, 1);
  }

  if (kind === 'dog') {
    paint([245, 240, 220], 13, 9.5);
    paint([245, 240, 220], 18, 9.5);
    paint(features.accent, 15, 15, 2, 1);
    paint(features.secondary, 12, 27, 2, 1);
    paint(features.secondary, 19, 27, 2, 1);
  }

  if (kind === 'person') {
    paint([245, 240, 220], 14, 8);
    paint([245, 240, 220], 18, 8);
    paint(features.accent, 15, 18, 3, 1);
    paint(OUTLINE, 11, 28, 4, 1);
    paint(OUTLINE, 18, 28, 4, 1);
  }
}

function rgbCss(color: RGB) {
  return `rgb(${color[0]} ${color[1]} ${color[2]})`;
}
