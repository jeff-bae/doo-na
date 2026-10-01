import type { Persona } from '@doona/shared';
import { Select, cx } from './ui';

// 캐릭터 색 = 디자인 토큰 브랜드 색. Tailwind가 클래스를 찾을 수 있도록 전체 이름으로 적는다
const AVATAR: Record<Persona['color'], string> = {
  lime: 'bg-accent-lime/35',
  cyan: 'bg-accent-cyan/25',
  violet: 'bg-accent-violet/20',
};
const CARD_ON: Record<Persona['color'], string> = {
  lime: 'border-accent-lime bg-accent-lime/10',
  cyan: 'border-accent-cyan bg-accent-cyan/10',
  violet: 'border-accent-violet bg-accent-violet/10',
};

export function PersonaAvatar({ persona, className }: { persona?: Persona; className?: string }) {
  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full',
        persona ? AVATAR[persona.color] : 'tint-brand',
        className ?? 'size-8 text-lg',
      )}
      title={persona?.name}
      aria-hidden
    >
      {persona?.emoji ?? '두'}
    </div>
  );
}

/** 새 대화 화면의 대화 상대 선택 카드 */
export function PersonaPicker({
  personas,
  selected,
  onSelect,
}: {
  personas: Persona[];
  selected: string | null;
  onSelect: (p: Persona) => void;
}) {
  return (
    <div className="grid w-full gap-2 sm:grid-cols-3" role="radiogroup" aria-label="대화 상대">
      {personas.map((p) => {
        const on = p.id === selected;
        return (
          <button
            key={p.id}
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(p)}
            className={cx(
              'flex flex-col items-start gap-1 rounded-sm border p-4 text-left transition-colors',
              on ? CARD_ON[p.color] : 'border-line bg-surface-0 hover:border-line-strong hover:bg-surface-1',
            )}
          >
            <div className="flex w-full items-center gap-2">
              <PersonaAvatar persona={p} className="size-9 text-xl" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">{p.name}</p>
                <p className="text-xs text-fg-muted">{p.tagline}</p>
              </div>
            </div>
            <p className="mt-1 text-xs font-normal text-fg-2">{p.description}</p>
            <p className="mt-auto pt-1 text-xs text-fg-muted">⏱ 답변 {p.speed}</p>
          </button>
        );
      })}
    </div>
  );
}

/** 헤더의 대화 상대 변경 */
export function PersonaSelect({
  personas,
  value,
  disabled,
  onChange,
}: {
  personas: Persona[];
  value: string | null;
  disabled?: boolean;
  onChange: (id: Persona['id']) => void;
}) {
  if (personas.length < 2) return null;
  return (
    <Select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Persona['id'])}
      title="대화 상대 바꾸기"
      aria-label="대화 상대"
      className="max-w-40"
    >
      {personas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.emoji} {p.name}
        </option>
      ))}
    </Select>
  );
}
