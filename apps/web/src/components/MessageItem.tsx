import { useEffect, useState } from 'react';
import { RiCheckLine, RiFileCopyLine, RiPencilLine, RiRefreshLine } from '@remixicon/react';
import type { Message, Persona } from '@doona/shared';
import { copyText } from '../lib/clipboard';
import { Markdown } from './Markdown';
import { PersonaAvatar } from './Persona';
import { Button, ICON, IconButton, Spinner, cx } from './ui';

interface Props {
  message: Pick<Message, 'id' | 'role' | 'content' | 'incomplete'> & { tool?: Message['tool'] };
  persona?: Persona;
  /** 답변 시작 전 서버가 알려준 대기 사유 */
  status?: string | null;
  streaming?: boolean;
  canRegenerate?: boolean;
  canEdit?: boolean;
  onRegenerate?: () => void;
  onEdit?: (content: string) => void;
}

/** 마우스를 올렸을 때(모바일은 항상) 보이는 메시지 도구 */
const TOOLS = 'mt-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100';

export function MessageItem({ message, persona, status, streaming, canRegenerate, canEdit, onRegenerate, onEdit }: Props) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const copy = async () => {
    if (await copyText(message.content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  const CopyIcon = copied ? RiCheckLine : RiFileCopyLine;

  if (message.role === 'user') {
    if (editing) {
      return (
        <div className="flex justify-end">
          <div className="w-full max-w-[85%] space-y-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(10, draft.split('\n').length + 1)}
              className="w-full resize-none rounded-sm border border-brand bg-surface-0 p-3 text-base text-fg outline-none focus-visible:outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                취소
              </Button>
              <Button
                size="sm"
                disabled={!draft.trim()}
                onClick={() => {
                  setEditing(false);
                  onEdit?.(draft);
                }}
              >
                다시 질문
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="group flex flex-col items-end">
        {message.tool && <ToolBadge tool={message.tool} />}
        <div className="max-w-[85%] rounded-sm bg-brand px-4 py-2.5 text-base whitespace-pre-wrap break-words text-white">
          {message.content}
        </div>
        <div className={TOOLS}>
          <IconButton label="복사" size="xs" onClick={copy}>
            <CopyIcon size={ICON.sm} />
          </IconButton>
          {canEdit && (
            <IconButton
              label="질문 수정"
              size="xs"
              onClick={() => {
                setDraft(message.content);
                setEditing(true);
              }}
            >
              <RiPencilLine size={ICON.sm} />
            </IconButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-3">
      <PersonaAvatar persona={persona} className="mt-0.5 size-8 text-lg" />
      <div className="min-w-0 flex-1">
        {persona && <p className="mb-1 text-xs text-fg-muted">{persona.name}</p>}
        {message.content ? (
          <div className={cx('markdown', streaming && 'cursor')}>
            <Markdown content={message.content} />
          </div>
        ) : (
          <Waiting status={status} speed={persona?.speed} />
        )}
        {message.incomplete && !streaming && (
          <p className="mt-2 text-xs text-state-warning">답변이 중간에 중지되었습니다.</p>
        )}
        {!streaming && message.content && (
          <div className={cx(TOOLS, '-ml-1.5')}>
            <IconButton label="복사" size="xs" onClick={copy}>
              <CopyIcon size={ICON.sm} />
            </IconButton>
            {canRegenerate && (
              <IconButton label="다시 생성" size="xs" onClick={onRegenerate}>
                <RiRefreshLine size={ICON.sm} />
              </IconButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 질문에 붙은 도구 — 결과를 펼쳐 볼 수 있다 */
function ToolBadge({ tool }: { tool: NonNullable<Message['tool']> }) {
  const running = !tool.result;
  return (
    <details className="group/tool mb-1 max-w-[85%] text-xs">
      <summary
        className={cx(
          'ml-auto flex w-fit cursor-pointer list-none items-center gap-1 rounded-full px-2.5 py-0.5',
          tool.isError ? 'tint-warning text-state-warning' : 'tint-brand text-brand',
          running && 'pointer-events-none',
        )}
      >
        {running ? <Spinner size={12} /> : <span aria-hidden>{tool.emoji}</span>}
        {tool.title}
        {running ? ' 중…' : tool.isError ? ' 실패' : ''}
        {!running && <span className="text-fg-muted group-open/tool:hidden">· 결과 보기</span>}
      </summary>
      {!running && (
        <pre className="mt-1 max-h-64 overflow-auto rounded-sm border border-line bg-surface-1 p-3 font-sans text-xs font-normal whitespace-pre-wrap text-fg-2">
          {tool.result}
        </pre>
      )}
    </details>
  );
}

/** 첫 글자가 나오기 전 대기 표시 — 14B 모델은 CPU에서 첫 글자까지 수십 초 걸릴 수 있다 */
function Waiting({ status, speed }: { status?: string | null; speed?: string }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const hint =
    status ??
    (sec >= 60
      ? '다른 사람의 질문을 먼저 처리하고 있어요. 조금만 더 기다려 주세요…'
      : sec >= 5
        ? `답변을 준비하고 있어요.${speed ? ` 보통 ${speed} 걸려요.` : ''}`
        : null);

  return (
    <div aria-label="답변 생성 중">
      <div className="flex h-7 items-center gap-1">
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="size-2 animate-bounce rounded-full bg-fg-muted"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
      {hint && (
        <p className="text-xs font-normal text-fg-2">
          {hint} <span className="text-fg-muted tabular-nums">({sec}초)</span>
        </p>
      )}
    </div>
  );
}
