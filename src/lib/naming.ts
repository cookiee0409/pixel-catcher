import type { RarityId } from '../types';

const PREFIX: Record<string, string[]> = {
  fire: ['활활', '이글', '불꽃', '재롱', '화르'],
  earth: ['단단', '바위', '흙냥', '우직', '든든'],
  light: ['반짝', '햇살', '눈부', '샛별', '윤슬'],
  grass: ['새싹', '풀잎', '초롱', '꼬물', '말랑'],
  water: ['찰랑', '물방', '퐁당', '시원', '파랑'],
  dark: ['그믐', '까망', '몽글', '스르', '밤톨'],
  fairy: ['몽실', '솜사', '나풀', '보들', '하늘'],
  steel: ['철컥', '단호', '뚝딱', '강철', '묵직'],
};

const SUFFIX = [
  '둥이', '몽이', '냥이', '뭉치', '토리', '봉이', '깨비', '동이', '복이', '꾸미',
];

const TITLE: Partial<Record<RarityId, string[]>> = {
  epic: ['수호자', '기사', '현자', '챔피언'],
  legendary: ['전설', '군주', '신수', '왕'],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateName(attribute: string, rarity: RarityId): string {
  const base = pick(PREFIX[attribute] ?? PREFIX.steel) + pick(SUFFIX);
  const titles = TITLE[rarity];
  if (titles) return `${base} ${pick(titles)}`;
  return base;
}
