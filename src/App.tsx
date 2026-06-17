import { useEffect, useRef, useState } from 'react';
import {
  fileToImage,
  imageToCanvas,
  removeBackground,
  preloadBackgroundModel,
  type RemovalMode,
} from './lib/background';
import { prepareSubject, pixelate } from './lib/pixelate';
import { RARITIES, RARITY_ORDER, rarityChance, rollRarity } from './lib/rarity';
import { generateName } from './lib/naming';
import { dex } from './lib/storage';
import { renderCard, downloadDataUrl } from './lib/cardExport';
import { loadImage } from './lib/image';
import type { DexEntry } from './types';
import GachaCard from './components/GachaCard';
import Dex from './components/Dex';

type Screen = 'home' | 'preview' | 'processing' | 'result';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<DexEntry | null>(null);
  const [showDex, setShowDex] = useState(false);
  const [dexCount, setDexCount] = useState(0);
  const [mode, setMode] = useState<RemovalMode>('fast');
  const [error, setError] = useState<string | null>(null);

  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dex.list().then((l) => setDexCount(l.length));
  }, [screen, showDex]);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const img = await fileToImage(file);
      setSourceImg(img);
      setPreviewUrl(imageToCanvas(img, 512).toDataURL('image/png'));
      setScreen('preview');
      if (mode === 'ai') preloadBackgroundModel();
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지 오류');
    }
  };

  const run = async () => {
    if (!sourceImg) return;
    setScreen('processing');
    setError(null);
    try {
      const base = imageToCanvas(sourceImg, 512);

      setStatus(mode === 'ai' ? '대상을 인식하는 중...' : '색과 실루엣을 찾는 중...');
      await tick();
      const removed = await removeBackground(base, mode, (p) => {
        const pct = Math.round(p * 100);
        if (mode === 'ai' && pct > 0 && pct < 100) {
          setStatus(`대상을 인식하는 중... ${pct}%`);
        }
      });
      const subject = prepareSubject(removed);

      setStatus('해상도 확률을 굴리는 중...');
      await tick();
      const rarity = rollRarity();
      setStatus(`${rarity.resolution} x ${rarity.resolution} 픽셀로 빚는 중...`);
      await tick();
      const { display, attribute } = pixelate(
        subject,
        rarity.resolution,
        rarity.colorDepth,
      );

      const entry: DexEntry = {
        id: crypto.randomUUID(),
        name: generateName(attribute.id, rarity.id),
        rarity: rarity.id,
        resolution: rarity.resolution,
        attribute: attribute.id,
        attributeLabel: attribute.label,
        attributeEmoji: attribute.emoji,
        date: new Date().toISOString(),
        image: display.toDataURL('image/png'),
      };

      await dex.add(entry);
      setResult(entry);
      setScreen('result');
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : '변환 중 오류가 발생했어요.');
      setScreen('preview');
    }
  };

  const savePng = async () => {
    if (!result) return;
    const sprite = await loadImage(result.image);
    const url = await renderCard(result, sprite);
    downloadDataUrl(url, `${result.name}.png`);
  };

  const reset = () => {
    setResult(null);
    setSourceImg(null);
    setPreviewUrl(null);
    setScreen('home');
  };

  if (showDex) return <Dex onBack={() => setShowDex(false)} />;

  return (
    <div className="app">
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onPick(e.target.files?.[0])}
      />

      {screen === 'home' && (
        <div className="screen home">
          <div className="logo">
            <span className="logo-pixel">▣</span>
            <h1>PIXEL CATCHER</h1>
            <p className="tagline">사진의 색과 모양을 잡아 도트 친구로 저장해요</p>
          </div>

          <div className="odds-strip" aria-label="해상도 확률">
            {RARITY_ORDER.map((id) => {
              const rarity = RARITIES[id];
              return (
                <span key={id} style={{ color: rarity.color }}>
                  {rarity.resolution}x{rarity.resolution} {rarityChance(id)}
                </span>
              );
            })}
          </div>

          <div className="home-actions">
            <button className="btn btn-big btn-primary" onClick={() => cameraInput.current?.click()}>
              📷 사진 촬영
            </button>
            <button className="btn btn-big btn-secondary" onClick={() => galleryInput.current?.click()}>
              🖼️ 갤러리에서 선택
            </button>
            <button className="btn btn-big btn-ghost" onClick={() => setShowDex(true)}>
              📒 도감 보기 <span className="badge">{dexCount}</span>
            </button>
          </div>

          <p className="hint">
            처음엔 사람, 동물, 소품처럼 가운데에 크게 보이는 대상을 찍으면 잘 잡혀요.
          </p>

          <label className="mode-toggle">
            <input
              type="checkbox"
              checked={mode === 'ai'}
              onChange={(e) => setMode(e.target.checked ? 'ai' : 'fast')}
            />
            <span>
              고급 AI 배경 인식 {mode === 'ai' ? '켜짐' : '꺼짐 - 빠른 캐릭터화'}
            </span>
          </label>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {screen === 'preview' && previewUrl && (
        <div className="screen preview">
          <header className="topbar">
            <button className="icon-btn" onClick={reset} aria-label="뒤로">
              ‹
            </button>
            <h1>미리보기</h1>
            <span />
          </header>
          <div className="preview-frame">
            <img src={previewUrl} alt="미리보기" />
          </div>
          <p className="hint">
            변환하면 색, 외곽선, 작은 소품이 단순한 도트 캐릭터에 반영됩니다.
          </p>
          <div className="stack">
            <button className="btn btn-big btn-primary" onClick={run}>
              🎲 해상도 뽑고 도트화하기
            </button>
            <button className="btn btn-ghost" onClick={reset}>
              다른 사진 고르기
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {screen === 'processing' && (
        <div className="screen processing">
          <div className="loader">
            <div className="loader-grid">
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
              ))}
            </div>
          </div>
          <p className="status">{status}</p>
          <p className="hint">
            낮은 해상도일수록 더 뭉툭하고, 높은 해상도일수록 사진의 특징이 더 남아요.
          </p>
        </div>
      )}

      {screen === 'result' && result && (
        <div className="screen result">
          <p className="result-tag">✦ 새로운 친구를 잡았다! ✦</p>
          <GachaCard entry={result} reveal />
          <div className="stack">
            <button className="btn btn-big btn-primary" onClick={savePng}>
              💾 PNG로 저장
            </button>
            <div className="row">
              <button className="btn btn-secondary" onClick={() => setShowDex(true)}>
                📒 도감
              </button>
              <button className="btn btn-secondary" onClick={reset}>
                🎰 또 잡기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function tick() {
  return new Promise((r) => setTimeout(r, 30));
}
