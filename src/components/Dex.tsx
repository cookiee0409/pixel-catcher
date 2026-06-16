import { useEffect, useState } from 'react';
import type { DexEntry } from '../types';
import { dex } from '../lib/storage';
import { RARITIES, RARITY_ORDER } from '../lib/rarity';
import GachaCard from './GachaCard';
import { renderCard, downloadDataUrl } from '../lib/cardExport';
import { loadImage } from '../lib/image';

interface Props {
  onBack: () => void;
}

export default function Dex({ onBack }: Props) {
  const [entries, setEntries] = useState<DexEntry[]>([]);
  const [selected, setSelected] = useState<DexEntry | null>(null);

  useEffect(() => {
    dex.list().then(setEntries);
  }, []);

  const refresh = () => dex.list().then(setEntries);

  const remove = async (id: string) => {
    await dex.remove(id);
    setSelected(null);
    refresh();
  };

  const save = async (entry: DexEntry) => {
    const sprite = await loadImage(entry.image);
    const url = await renderCard(entry, sprite);
    downloadDataUrl(url, `${entry.name}.png`);
  };

  const counts = RARITY_ORDER.map((id) => ({
    id,
    rarity: RARITIES[id],
    n: entries.filter((e) => e.rarity === id).length,
  }));

  return (
    <div className="screen dex-screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">
          ‹
        </button>
        <h1>도감</h1>
        <span className="dex-total">{entries.length}</span>
      </header>

      <div className="dex-stats">
        {counts.map((c) => (
          <span key={c.id} className="dex-stat" style={{ color: c.rarity.color }}>
            ● {c.n}
          </span>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="empty">
          <p>🥚</p>
          <p>아직 잡은 픽셀 친구가 없어요.</p>
        </div>
      ) : (
        <div className="dex-grid">
          {entries.map((e) => (
            <button
              key={e.id}
              className={`dex-cell rarity-${e.rarity}`}
              style={{ '--rarity-color': RARITIES[e.rarity].color } as React.CSSProperties}
              onClick={() => setSelected(e)}
            >
              <img src={e.image} alt={e.name} className="sprite" />
              <span className="dex-cell-name">{e.name}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="modal" onClick={() => setSelected(null)}>
          <div className="modal-inner" onClick={(ev) => ev.stopPropagation()}>
            <GachaCard entry={selected} />
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => save(selected)}>
                PNG 저장
              </button>
              <button className="btn btn-danger" onClick={() => remove(selected.id)}>
                놓아주기
              </button>
            </div>
            <button className="btn btn-ghost" onClick={() => setSelected(null)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
