import { useEffect, useRef, useState } from 'react';
import {
  RiArrowDownLine,
  RiChatNewLine,
  RiCloseLine,
  RiDownload2Line,
  RiLightbulbLine,
  RiMenuLine,
  RiRestartLine,
} from '@remixicon/react';
import { api } from '../lib/api';
import { downloadFile } from '../lib/clipboard';
import { useChat } from '../store/chat';
import { Composer, type ComposerHandle } from './Composer';
import { MessageItem } from './MessageItem';
import { PersonaAvatar, PersonaPicker, PersonaSelect } from './Persona';
import { Button, ICON, IconButton, Spinner } from './ui';

/** 이 개수 이상이면 새 대화를 권한다 — 작은 모델은 대화가 길어질수록 앞 내용에 휩쓸린다 */
const LONG_CONVERSATION = 16;

const SUGGESTIONS = [
  '파이썬으로 CSV 파일을 읽어 합계를 구하는 코드를 알려줘',
  'Git에서 마지막 커밋을 취소하는 방법은?',
  'SQL JOIN 종류를 예시와 함께 설명해줘',
  '정규식으로 이메일 주소를 검사하는 방법',
];

export function ChatView({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const {
    currentId,
    messages,
    streaming,
    error,
    loadingMessages,
    conversations,
    personas,
    tools,
    defaultPersona,
    draftPersona,
    send,
    stop,
    regenerate,
    editAndResend,
    clearError,
    setPersona,
    newChat,
  } = useChat();
  const [dismissedHint, setDismissedHint] = useState<string | null>(null);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const stick = useRef(true);

  const conversation = conversations.find((c) => c.id === currentId);
  const isStreamingHere = !!streaming && streaming.conversationId === currentId;
  const personaId = conversation?.persona ?? draftPersona ?? defaultPersona;
  const persona = personas.find((p) => p.id === personaId);
  const personaOf = (id: string | null) => personas.find((p) => p.id === id) ?? persona;

  // 새 내용이 오면 맨 아래에 붙어 있을 때만 따라 내려간다
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming?.content]);

  useEffect(() => {
    stick.current = true;
    composer.current?.focus();
  }, [currentId]);

  const onScroll = () => {
    const el = scroller.current!;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = bottom;
    setAtBottom(bottom);
  };

  const scrollToBottom = () => {
    const el = scroller.current!;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    stick.current = true;
  };

  const onSend = (text: string, tool?: string) => {
    stick.current = true;
    void send(text, tool);
  };

  const exportAs = async (format: 'md' | 'json') => {
    if (!currentId) return;
    const data = await api.exportConversation(currentId, format);
    const name = (conversation?.title ?? 'doona').replace(/[\\/:*?"<>|]/g, '_');
    if (format === 'json') downloadFile(`${name}.json`, JSON.stringify(data, null, 2), 'application/json');
    else downloadFile(`${name}.md`, String(data), 'text/markdown');
  };

  const showLongHint =
    !!currentId && !streaming && messages.length >= LONG_CONVERSATION && dismissedHint !== currentId;

  const lastAssistant = messages.at(-1)?.role === 'assistant' ? messages.at(-1)!.id : null;
  const empty = !messages.length && !loadingMessages;

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface-0">
      <header className="safe-top flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 sm:px-4">
        <IconButton label="대화 목록" onClick={onOpenSidebar} className="md:hidden">
          <RiMenuLine size={ICON.md} />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{conversation?.title ?? '새 대화'}</h1>
        <PersonaSelect
          personas={personas}
          value={personaId}
          disabled={isStreamingHere}
          onChange={(id) => void setPersona(id)}
        />
        {currentId && (
          <details className="relative">
            <summary
              className="flex size-(--control-height-md) cursor-pointer list-none items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              title="내보내기"
            >
              <RiDownload2Line size={ICON.md} />
            </summary>
            <div className="absolute right-0 z-(--z-dropdown) mt-1 w-44 rounded-sm border border-line bg-elevated p-1 shadow-md">
              {(['md', 'json'] as const).map((f) => (
                <button
                  key={f}
                  onClick={(e) => {
                    (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
                    void exportAs(f);
                  }}
                  className="flex h-(--control-height-sm) w-full items-center rounded-xs px-3 text-left text-sm text-fg transition-colors hover:bg-surface-2"
                >
                  {f === 'md' ? 'Markdown (.md)' : 'JSON (.json)'}
                </button>
              ))}
            </div>
          </details>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="scrollbar-thin h-full overflow-y-auto">
          {loadingMessages && (
            <div className="flex justify-center py-10 text-fg-muted">
              <Spinner size={ICON.md} />
            </div>
          )}

          {empty && (
            <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-center">
              <PersonaAvatar persona={persona} className="mb-4 size-14 text-3xl" />
              <h2 className="text-h3">누구에게 물어볼까요?</h2>
              <p className="mt-2 text-sm text-fg-2">대화 상대를 고르고 질문하세요. 대화 중에도 위에서 바꿀 수 있어요.</p>
              {personas.length > 1 && (
                <div className="mt-6 w-full">
                  <PersonaPicker personas={personas} selected={personaId} onSelect={(p) => void setPersona(p.id)} />
                </div>
              )}
              <p className="mt-4 text-xs font-normal text-fg-muted">
                💡 주제가 바뀌면 새 대화에서 물어보세요. 답이 더 정확해집니다.
              </p>
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSend(s)}
                    className="rounded-sm border border-line bg-surface-0 px-4 py-3 text-left text-sm text-fg-2 transition-colors hover:border-brand hover:text-fg"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!empty && (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
              {messages.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  persona={personaOf(m.persona)}
                  canEdit={!streaming && !m.id.startsWith('temp-')}
                  canRegenerate={!streaming && m.id === lastAssistant}
                  onRegenerate={() => void regenerate()}
                  onEdit={(text) => void editAndResend(m.id, text)}
                />
              ))}
              {isStreamingHere && (
                <MessageItem
                  message={{ id: 'streaming', role: 'assistant', content: streaming!.content, incomplete: false }}
                  persona={persona}
                  status={streaming!.status}
                  streaming
                />
              )}
              {error && (
                <div className="tint-danger flex items-center gap-2 rounded-sm border border-state-danger/40 py-1.5 pr-1.5 pl-3 text-sm text-state-danger">
                  <p className="flex-1">{error}</p>
                  {messages.some((m) => m.role === 'user') && currentId && (
                    <Button variant="ghost" size="xs" onClick={() => void regenerate()} className="text-state-danger">
                      <RiRestartLine size={ICON.sm} /> 다시 시도
                    </Button>
                  )}
                  <IconButton label="닫기" size="xs" onClick={clearError} className="text-state-danger">
                    <RiCloseLine size={ICON.sm} />
                  </IconButton>
                </div>
              )}
            </div>
          )}
        </div>

        {!atBottom && (
          <button
            onClick={scrollToBottom}
            aria-label="맨 아래로"
            className="absolute bottom-3 left-1/2 flex size-(--control-height-sm) -translate-x-1/2 items-center justify-center rounded-full border border-line bg-elevated text-fg-2 shadow-md transition-colors hover:text-fg"
          >
            <RiArrowDownLine size={ICON.sm} />
          </button>
        )}
      </div>

      <div className="safe-bottom">
        {showLongHint && (
          <div className="mx-auto w-full max-w-3xl px-3 sm:px-4">
            <div className="tint-warning mb-2 flex items-center gap-2 rounded-sm border border-state-warning/40 py-1.5 pr-1.5 pl-3 text-sm text-fg">
              <RiLightbulbLine size={ICON.sm} className="shrink-0 text-state-warning" />
              <p className="min-w-0 flex-1">
                대화가 길어졌어요. 다른 주제라면 <b>새 대화</b>에서 물어봐야 더 정확한 답을 받을 수 있어요.
              </p>
              <Button size="xs" onClick={newChat}>
                <RiChatNewLine size={ICON.sm} /> 새 대화
              </Button>
              <IconButton label="닫기" size="xs" onClick={() => setDismissedHint(currentId)}>
                <RiCloseLine size={ICON.sm} />
              </IconButton>
            </div>
          </div>
        )}
        <Composer
          ref={composer}
          placeholder={persona ? `${persona.emoji} ${persona.name}에게 질문하세요…` : undefined}
          tools={tools}
          streaming={isStreamingHere}
          disabled={!!streaming && !isStreamingHere}
          onSend={onSend}
          onStop={stop}
        />
      </div>
    </main>
  );
}
