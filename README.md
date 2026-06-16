# 🎮 Pixel Catcher

사진을 올리거나 촬영하면 대상을 추출·배경 제거 후 **도트 캐릭터**로 변환하고,
등급(레어도)을 뽑아 카드로 보여주는 모바일 우선 웹앱입니다.

## 빠른 시작

```bash
npm install
npm run dev        # 개발 서버 (모바일 테스트는 같은 와이파이에서 표시되는 IP 주소로 접속)
npm run build      # 프로덕션 빌드 → dist/
npm run preview    # 빌드 결과 미리보기
```

> 정적 SPA라 `dist/` 를 Netlify·Vercel·GitHub Pages 등 아무 정적 호스팅에 올리면 됩니다.

## 기술 선택 (가볍게)

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 프레임워크 | **Vite + React + TS** | 서버가 필요 없는 클라이언트 앱이라 Next.js보다 가볍고 정적 배포가 쉬움 |
| 픽셀화 | **HTML Canvas** (라이브러리 0개) | 다운스케일 → median-cut 색상 감축 → 외곽선 → 업스케일 |
| 배경 제거 | **@imgly/background-removal** (지연 로딩) | 첫 변환 때만 모델 다운로드 → 초기 번들은 가벼움. 실패/오프라인 시 코너 플러드필로 자동 폴백 |
| 저장 | **localStorage** (`DexStorage` 인터페이스 뒤) | 백엔드 교체 지점이 한 곳(`src/lib/storage.ts`)이라 Supabase/Firebase로 확장 쉬움 |

## 처리 파이프라인

`src/lib/` 가 핵심입니다.

1. `background.ts` — 이미지 로드/리사이즈, AI 또는 간이 배경 제거
2. `pixelate.ts` — 대상 바운딩 박스 추출 → NxN 다운스케일 → 색상 감축 → 외곽선 → 업스케일
3. `rarity.ts` — 가중치 기반 등급 뽑기 (해상도 결정)
4. `attributes.ts` / `naming.ts` — 대표 색으로 속성·이름 생성
5. `cardExport.ts` — 결과 카드를 PNG로 합성/저장
6. `storage.ts` — 도감 저장소(localStorage)

## 등급 / 해상도 / 확률

| 등급 | 해상도 | 확률 |
| --- | --- | --- |
| Common | 16×16 | 50% |
| Uncommon | 24×24 | 27% |
| Rare | 32×32 | 15% |
| Epic | 48×48 | 6% |
| Legendary | 64×64 | 2% |

확률·해상도·색상 수는 `src/lib/rarity.ts` 에서 조정할 수 있습니다.

## Supabase로 확장하려면

`src/lib/storage.ts` 의 `DexStorage` 인터페이스를 구현하는 클래스를 하나 더 만들고,
파일 맨 아래 `export const dex` 한 줄만 바꾸면 됩니다. 이미지(`image`)는 dataURL이라
Storage 버킷 업로드 + URL 저장으로 바꾸면 용량도 절약됩니다.
