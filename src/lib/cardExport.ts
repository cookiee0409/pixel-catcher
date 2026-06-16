import type { DexEntry } from '../types';
import { RARITIES } from './rarity';

const FONT = '"Galmuri11", monospace';

async function ensureFont() {
  try {
    if ('fonts' in document) {
      await Promise.all([
        document.fonts.load(`24px ${FONT}`),
        document.fonts.load(`bold 40px ${FONT}`),
      ]);
    }
  } catch {
    /* 폰트 로드 실패해도 fallback 으로 진행 */
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 결과 카드를 PNG dataURL 로 합성한다. */
export async function renderCard(
  entry: DexEntry,
  sprite: HTMLImageElement | HTMLCanvasElement,
): Promise<string> {
  await ensureFont();
  const rarity = RARITIES[entry.rarity];

  const W = 600;
  const H = 860;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 바깥 배경
  ctx.fillStyle = '#2b2233';
  ctx.fillRect(0, 0, W, H);

  // 카드 본체 (양피지 톤)
  const pad = 28;
  ctx.save();
  ctx.shadowColor = rarity.glow;
  ctx.shadowBlur = 50;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 28);
  ctx.fillStyle = '#f3e4c7';
  ctx.fill();
  ctx.restore();

  // 등급 테두리
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 28);
  ctx.lineWidth = 10;
  ctx.strokeStyle = rarity.color;
  ctx.stroke();

  // 상단 등급 배너
  const bannerY = pad + 22;
  roundRect(ctx, pad + 26, bannerY, W - (pad + 26) * 2, 56, 14);
  ctx.fillStyle = rarity.color;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold 30px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rarity.label.toUpperCase(), W / 2, bannerY + 30);

  // 스프라이트 영역
  const artY = bannerY + 80;
  const artSize = 360;
  const artX = (W - artSize) / 2;
  roundRect(ctx, artX, artY, artSize, artSize, 18);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  ctx.strokeStyle = '#d8c3a0';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.imageSmoothingEnabled = false;
  const sw = (sprite as HTMLCanvasElement).width || sprite.width;
  const sh = (sprite as HTMLCanvasElement).height || sprite.height;
  const fit = Math.min((artSize - 40) / sw, (artSize - 40) / sh);
  const dw = sw * fit;
  const dh = sh * fit;
  ctx.drawImage(sprite, artX + (artSize - dw) / 2, artY + (artSize - dh) / 2, dw, dh);

  // 이름
  ctx.fillStyle = '#3a2a33';
  ctx.font = `bold 38px ${FONT}`;
  ctx.fillText(entry.name, W / 2, artY + artSize + 50);

  // 정보 행
  const rows: [string, string][] = [
    ['해상도', `${entry.resolution} × ${entry.resolution}`],
    ['속성', `${entry.attributeEmoji} ${entry.attributeLabel}`],
    ['획득일', formatDate(entry.date)],
  ];
  ctx.font = `22px ${FONT}`;
  let ry = artY + artSize + 96;
  const rowX = pad + 48;
  const rowW = W - rowX * 2;
  for (const [label, value] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8a6f54';
    ctx.fillText(label, rowX, ry);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#3a2a33';
    ctx.fillText(value, rowX + rowW, ry);
    ry += 40;
  }

  // 푸터
  ctx.textAlign = 'center';
  ctx.fillStyle = '#b8a07e';
  ctx.font = `18px ${FONT}`;
  ctx.fillText('PIXEL CATCHER', W / 2, H - pad - 24);

  return canvas.toDataURL('image/png');
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
