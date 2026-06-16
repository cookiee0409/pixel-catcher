/** 이미지 처리 공통 유틸 + 배경 제거 (AI / 간이 폴백). */

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

/** 너무 큰 사진은 처리 속도를 위해 축소하여 캔버스로 옮긴다. */
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

// 양자화 경량 모델: 다운로드/추론이 가장 빠르다. 도트(≤64px) 출력이라 화질 차이는 사실상 없음.
const MODEL = 'isnet_quint8' as const;

/** WebGPU 사용 가능하면 GPU 추론(훨씬 빠름), 아니면 CPU. */
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
/**
 * 모델 자산을 미리 다운로드한다. 사진을 고르는 즉시 호출하면
 * 사용자가 '변환'을 누를 때쯤엔 이미 받아져 있어 체감 속도가 크게 빨라진다.
 * (브라우저가 캐시하므로 두 번째 변환부터는 즉시)
 */
export async function preloadBackgroundModel(): Promise<void> {
  if (preloadStarted) return;
  preloadStarted = true;
  try {
    const { preload } = await import('@imgly/background-removal');
    await preload(imglyConfig(pickDevice()));
  } catch (err) {
    preloadStarted = false; // 실패 시 다음에 재시도 허용
    console.warn('모델 프리로드 실패', err);
  }
}

/**
 * 배경 제거. 'ai'는 @imgly 경량 모델을 지연 로딩(첫 사용 시 다운로드),
 * 실패하거나 'fast'면 코너 플러드필 방식으로 폴백한다.
 */
export async function removeBackground(
  canvas: HTMLCanvasElement,
  mode: RemovalMode = 'ai',
  onProgress?: ProgressFn,
): Promise<HTMLCanvasElement> {
  if (mode === 'ai') {
    try {
      return await aiRemove(canvas, onProgress);
    } catch (err) {
      console.warn('AI 배경 제거 실패, 간이 방식으로 폴백합니다.', err);
    }
  }
  return floodFillRemove(canvas);
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
    // GPU 추론 실패 시 CPU 로 한 번 더 시도(폴백 전에)
    if (device === 'gpu') {
      console.warn('GPU 추론 실패, CPU 로 재시도합니다.', err);
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

/**
 * 간이 배경 제거: 네 모서리 색과 비슷한 영역을 가장자리부터 채워(flood fill) 투명화.
 * 단색/단순 배경에 효과적이며 모델 다운로드가 필요 없다.
 */
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

  const colorAt = (x: number, y: number): [number, number, number] => {
    const i = (y * w + x) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };

  const stack: number[] = [];
  for (const [sx, sy] of seeds) {
    const ref = colorAt(sx, sy);
    stack.push(sx, sy);
    while (stack.length) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const p = y * w + x;
      if (visited[p]) continue;
      const i = p * 4;
      const dr = d[i] - ref[0];
      const dg = d[i + 1] - ref[1];
      const db = d[i + 2] - ref[2];
      if (dr * dr + dg * dg + db * db > tolerance) continue;
      visited[p] = 1;
      d[i + 3] = 0;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}
