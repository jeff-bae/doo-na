import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RiChatNewLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiLogoutBoxRLine,
  RiPencilLine,
  RiSearchLine,
  RiSettings3Line,
} from '@remixicon/react';
import type { Conversation } from '@doona/shared';
import { useAuth } from '../store/auth';
import { useChat } from '../store/chat';
import { ICON, IconButton, Input, Spinner, cx } from './ui';

function groupByDate(list: Conversation[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const groups: { label: string; items: Conversation[] }[] = [
    { label: '오늘', items: [] },
    { label: '어제', items: [] },
    { label: '지난 7일', items: [] },
    { label: '지난 30일', items: [] },
    { label: '이전', items: [] },
  ];
  for (const c of list) {
    const t = new Date(c.updatedAt).getTime();
    const i =
      t >= startOfToday.getTime()
        ? 0
        : t >= startOfToday.getTime() - day
          ? 1
          : t >= startOfToday.getTime() - 7 * day
            ? 2
            : t >= startOfToday.getTime() - 30 * day
              ? 3
              : 4;
    groups[i]!.items.push(c);
  }
  return groups.filter((g) => g.items.length);
}

function Item({ c, active, onSelect }: { c: Conversation; active: boolean; onSelect: () => void }) {
  const { rename, remove, streaming, personas } = useChat();
  const emoji = personas.find((p) => p.id === c.persona)?.emoji;
  const [mode, setMode] = useState<'view' | 'rename' | 'confirm'>('view');
  const [title, setTitle] = useState(c.title);
  const busy = streaming?.conversationId === c.id;

  if (mode === 'rename') {
    const save = () => {
      const t = title.trim();
      if (t && t !== c.title) void rename(c.id, t);
      setMode('view');
    };
    return (
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setMode('view');
        }}
        onBlur={save}
        aria-label="대화 이름"
      />
    );
  }

  return (
    <div
      className={cx(
        'group relative flex h-(--control-height-sm) items-center rounded-sm text-sm transition-colors',
        active ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
      )}
    >
      {/* 선택 표시 */}
      {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" aria-hidden />}
      <button onClick={onSelect} className="flex h-full min-w-0 flex-1 items-center truncate px-3 text-left" title={c.title}>
        {busy ? (
          <Spinner className="mr-1.5 shrink-0 text-brand" />
        ) : (
          emoji && (
            <span className="mr-1.5 shrink-0" aria-hidden>
              {emoji}
            </span>
          )
        )}
        <span className="truncate">{c.title}</span>
      </button>
      {mode === 'confirm' ? (
        <div className="flex shrink-0 items-center pr-0.5">
          <span className="mr-1 text-xs text-state-danger">삭제?</span>
          <IconButton label="삭제 확인" size="xs" className="text-state-danger" onClick={() => void remove(c.id)}>
            <RiCheckLine size={ICON.sm} />
          </IconButton>
          <IconButton label="취소" size="xs" onClick={() => setMode('view')}>
            <RiCloseLine size={ICON.sm} />
          </IconButton>
        </div>
      ) : (
        <div
          className={cx(
            'flex shrink-0 pr-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
            active && 'max-md:opacity-100',
          )}
        >
          <IconButton
            label="이름 변경"
            size="xs"
            onClick={() => {
              setTitle(c.title);
              setMode('rename');
            }}
          >
            <RiPencilLine size={ICON.sm} />
          </IconButton>
          <IconButton label="삭제" size="xs" disabled={busy} onClick={() => setMode('confirm')}>
            <RiDeleteBinLine size={ICON.sm} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  onNavigate,
  onOpenSettings,
  searchRef,
}: {
  onNavigate: () => void;
  onOpenSettings: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { conversations, listLoaded, currentId, select, newChat, loadConversations } = useChat();
  const { user, logout } = useAuth();
  const [q, setQ] = useState('');
  const first = useRef(true);

  // 검색어 입력 후 300ms 뒤 서버 검색
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => void loadConversations(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q, loadConversations]);

  const groups = useMemo(() => groupByDate(conversations), [conversations]);

  return (
    <div className="safe-top flex h-full flex-col border-r border-line bg-surface-1">
      <div className="flex h-14 shrink-0 items-center gap-2 pr-2 pl-4">
        <img src="/favicon.svg" alt="" className="size-7" />
        <span className="flex-1 text-base font-bold">두나</span>
        <IconButton
          label="새 대화 (Ctrl+Shift+O)"
          onClick={() => {
            newChat();
            onNavigate();
          }}
        >
          <RiChatNewLine size={ICON.md} />
        </IconButton>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <RiSearchLine
            size={ICON.sm}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-muted"
          />
          <Input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="대화 검색 (Ctrl+K)"
            aria-label="대화 검색"
            className="pr-8 pl-8"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="검색어 지우기"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-fg-muted hover:text-fg"
            >
              <RiCloseLine size={ICON.sm} />
            </button>
          )}
        </div>
      </div>

      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!listLoaded && (
          <div className="flex justify-center py-6 text-fg-muted">
            <Spinner size={ICON.md} />
          </div>
        )}
        {listLoaded && !conversations.length && (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">
            {q ? '검색 결과가 없습니다.' : '아직 대화가 없습니다.'}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            <h3 className="px-3 pt-2 pb-1 text-xs text-fg-muted">{g.label}</h3>
            {g.items.map((c) => (
              <Item
                key={c.id}
                c={c}
                active={c.id === currentId}
                onSelect={() => {
                  void select(c.id);
                  onNavigate();
                }}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="safe-bottom border-t border-line p-2">
        <div className="flex items-center gap-2 pl-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-fg-2">
            {user?.username.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <p className="truncate text-sm font-medium">{user?.username}</p>
            {user?.isAdmin && (
              <span className="tint-brand shrink-0 rounded-full px-2 py-0.5 text-xs text-brand">관리자</span>
            )}
          </div>
          <IconButton label="설정" onClick={onOpenSettings}>
            <RiSettings3Line size={ICON.md} />
          </IconButton>
          <IconButton label="로그아웃" onClick={() => void logout()}>
            <RiLogoutBoxRLine size={ICON.md} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
