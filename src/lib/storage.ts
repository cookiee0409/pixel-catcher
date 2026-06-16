import type { DexEntry } from '../types';

/**
 * 도감 저장소 추상화. 지금은 localStorage 구현만 있지만,
 * 같은 인터페이스로 Supabase/Firebase 구현을 추가해 교체할 수 있다.
 */
export interface DexStorage {
  list(): Promise<DexEntry[]>;
  add(entry: DexEntry): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'pixel-catcher:dex:v1';

class LocalDexStorage implements DexStorage {
  private read(): DexEntry[] {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as DexEntry[]) : [];
    } catch {
      return [];
    }
  }

  private write(entries: DexEntry[]): void {
    localStorage.setItem(KEY, JSON.stringify(entries));
  }

  async list(): Promise<DexEntry[]> {
    // 최신순
    return this.read().sort((a, b) => b.date.localeCompare(a.date));
  }

  async add(entry: DexEntry): Promise<void> {
    const entries = this.read();
    entries.push(entry);
    this.write(entries);
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((e) => e.id !== id));
  }

  async clear(): Promise<void> {
    this.write([]);
  }
}

// 앱 전체에서 쓰는 단일 인스턴스. 백엔드 교체 시 이 줄만 바꾸면 된다.
export const dex: DexStorage = new LocalDexStorage();
