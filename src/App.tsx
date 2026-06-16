import { useEffect, useRef, useState } from 'react';
import {
  fileToImage,
  imageToCanvas,
  removeBackground,
  preloadBackgroundModel,
  type RemovalMode,
} from './lib/background';
import { prepareSubject, pixelate } from './lib/pixelate';
import { rollRarity } from './lib/rarity';
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
  const [mode, setMode] = useState<RemovalMode>('ai');
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
      // objectURL 은 로드 후 폐기되므로 안정적인 dataURL 로 미리보기 저장
      setPreviewUrl(imageToCanvas(img, 512).toDataURL('image/png'));
      setScreen('preview');
      // 사진을 고르는 즉시 모델을 미리 받아둔다(변환 누를 때쯤이면 준비 완료).
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
      // 출력이 ≤64px 도트라 큰 원본이 필요 없다. 작게 넣을수록 추론이 빠름.
      const base = imageToCanvas(sourceImg, 512);

      setStatus(mode === 'ai' ? '대상을 인식하는 중…' : '배경을 지우는 중…');
      await tick();
      const removed = await removeBackground(base, mode, (p) => {
        const pct = Math.round(p * 100);
        if (mode === 'ai' && pct > 0 && pct < 100) {
          setStatus(`대상을 인식하는 중… ${pct}%`);
        }
      });
      const subject = prepareSubject(removed);

      const rarity = rollRarity();
      setStatus('픽셀로 빚는 중…');
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
            <p className="tagline">사진을 도트 친구로 — 어떤 등급이 나올까?</p>
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

          <label className="mode-toggle">
            <input
              type="checkbox"
              checked={mode === 'ai'}
              onChange={(e) => setMode(e.target.checked ? 'ai' : 'fast')}
            />
            <span>AI 배경 인식 {mode === 'ai' ? '켜짐' : '꺼짐(빠름)'}</span>
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
          <p className="hint">대상이 가운데에 크게 보이면 더 잘 잡혀요.</p>
          <div className="stack">
            <button className="btn btn-big btn-primary" onClick={run}>
              ✨ 도트로 변환하기
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
          <p className="hint">AI 모델 첫 실행 시 잠깐 더 걸릴 수 있어요.</p>
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

/** UI 가 다시 그려질 틈을 준다(상태 텍스트 갱신용). */
function tick() {
  return new Promise((r) => setTimeout(r, 30));
}
