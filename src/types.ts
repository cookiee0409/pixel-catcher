export type RarityId =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export interface Rarity {
  id: RarityId;
  label: string;
  resolution: number; // NxN
  weight: number; // 뽑기 확률 가중치
  color: string; // 강조색
  glow: string; // 빛 번짐 색
  colorDepth: number; // 팔레트 비트수 (2^depth = 색상 수)
}

export interface Attribute {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

export interface DexEntry {
  id: string;
  name: string;
  rarity: RarityId;
  resolution: number;
  attribute: string; // attribute id
  attributeLabel: string;
  attributeEmoji: string;
  subjectKind?: 'cat' | 'dog' | 'person';
  accessory?: 'none' | 'hat' | 'collar' | 'bag';
  date: string; // ISO
  image: string; // 캐릭터 스프라이트 PNG dataURL (투명 배경)
}
