import type { Attribute } from '../types';

export const ATTRIBUTES: Record<string, Attribute> = {
  fire: { id: 'fire', label: '불', emoji: '🔥', color: '#e0563b' },
  earth: { id: 'earth', label: '대지', emoji: '🪨', color: '#b07b3e' },
  light: { id: 'light', label: '빛', emoji: '✨', color: '#f0c64a' },
  grass: { id: 'grass', label: '풀', emoji: '🌿', color: '#5fbf4f' },
  water: { id: 'water', label: '물', emoji: '💧', color: '#3f8bd1' },
  dark: { id: 'dark', label: '어둠', emoji: '🌙', color: '#7a5cc0' },
  fairy: { id: 'fairy', label: '요정', emoji: '🌸', color: '#e07ab0' },
  steel: { id: 'steel', label: '강철', emoji: '⚙️', color: '#9aa0a6' },
};

/**
 * 대표 색의 HSL 값으로 속성을 결정한다.
 * @param h 0-360, @param s 0-1, @param l 0-1
 */
export function attributeFromColor(h: number, s: number, l: number): Attribute {
  if (s < 0.12) {
    if (l > 0.7) return ATTRIBUTES.light;
    if (l < 0.25) return ATTRIBUTES.dark;
    return ATTRIBUTES.steel;
  }
  if (h < 20 || h >= 345) return ATTRIBUTES.fire;
  if (h < 45) return ATTRIBUTES.earth;
  if (h < 70) return ATTRIBUTES.light;
  if (h < 160) return ATTRIBUTES.grass;
  if (h < 255) return ATTRIBUTES.water;
  if (h < 300) return ATTRIBUTES.dark;
  return ATTRIBUTES.fairy;
}
