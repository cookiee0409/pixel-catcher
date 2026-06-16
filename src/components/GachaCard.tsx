import { RARITIES } from '../lib/rarity';
import { formatDate } from '../lib/cardExport';
import type { DexEntry } from '../types';

interface Props {
  entry: DexEntry;
  reveal?: boolean;
}

/** 결과/도감 상세에서 쓰는 캐릭터 카드. */
export default function GachaCard({ entry, reveal }: Props) {
  const rarity = RARITIES[entry.rarity];
  return (
    <div
      className={`card rarity-${entry.rarity} ${reveal ? 'card-reveal' : ''}`}
      style={
        {
          '--rarity-color': rarity.color,
          '--rarity-glow': rarity.glow,
        } as React.CSSProperties
      }
    >
      <div className="card-banner">{rarity.label.toUpperCase()}</div>

      <div className="card-art">
        <div className="card-art-glow" />
        <img src={entry.image} alt={entry.name} className="sprite" />
      </div>

      <h2 className="card-name">{entry.name}</h2>

      <dl className="card-info">
        <div>
          <dt>해상도</dt>
          <dd>
            {entry.resolution} × {entry.resolution}
          </dd>
        </div>
        <div>
          <dt>속성</dt>
          <dd>
            {entry.attributeEmoji} {entry.attributeLabel}
          </dd>
        </div>
        <div>
          <dt>획득일</dt>
          <dd>{formatDate(entry.date)}</dd>
        </div>
      </dl>
    </div>
  );
}
