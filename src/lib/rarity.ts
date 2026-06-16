import type { Rarity, RarityId } from '../types';

export const RARITIES: Record<RarityId, Rarity> = {
  common: {
    id: 'common',
    label: 'Common',
    resolution: 16,
    weight: 50,
    color: '#9aa0a6',
    glow: 'rgba(154,160,166,0.55)',
    colorDepth: 3, // 8색
  },
  uncommon: {
    id: 'uncommon',
    label: 'Uncommon',
    resolution: 24,
    weight: 27,
    color: '#5fbf4f',
    glow: 'rgba(95,191,79,0.6)',
    colorDepth: 3, // 8색
  },
  rare: {
    id: 'rare',
    label: 'Rare',
    resolution: 32,
    weight: 15,
    color: '#3f8bd1',
    glow: 'rgba(63,139,209,0.65)',
    colorDepth: 4, // 16색
  },
  epic: {
    id: 'epic',
    label: 'Epic',
    resolution: 48,
    weight: 6,
    color: '#a35cd6',
    glow: 'rgba(163,92,214,0.7)',
    colorDepth: 4, // 16색
  },
  legendary: {
    id: 'legendary',
    label: 'Legendary',
    resolution: 64,
    weight: 2,
    color: '#f0b429',
    glow: 'rgba(240,180,41,0.8)',
    colorDepth: 5, // 32색
  },
};

export const RARITY_ORDER: RarityId[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

/** 가중치 기반으로 등급을 뽑는다. */
export function rollRarity(): Rarity {
  const list = RARITY_ORDER.map((id) => RARITIES[id]);
  const total = list.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of list) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return RARITIES.common;
}

export function rarityChance(id: RarityId): string {
  const total = RARITY_ORDER.reduce((s, k) => s + RARITIES[k].weight, 0);
  return ((RARITIES[id].weight / total) * 100).toFixed(0) + '%';
}
