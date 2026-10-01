import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { RiArrowUpLine, RiCloseLine, RiStopFill, RiToolsLine } from '@remixicon/react';
import type { ToolInfo } from '@doona/shared';
import { ICON, IconButton, cx } from './ui';

export interface ComposerHandle {
  focus: () => void;
}

interface Props {
  placeholder?: string;
  /** 쓸 수 있는 도구 (비어 있으면 도구 버튼 숨김) */
  tools?: ToolInfo[];
  streaming: boolean;
  disabled?: boolean;
  onSend: (text: string, tool?: string) => void;
  onStop: () => void;
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { placeholder, tools = [], streaming, disabled, onSend, onStop },
  ref,
) {
  const [text, setText] = useState('');
  const [tool, setTool] = useState<ToolInfo | null>(null);
  const [menu, setMenu] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 메뉴 바깥을 누르면 닫기
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  const pickTool = (t: ToolInfo | null) => {
    setTool(t);
    setMenu(false);
    ta.current?.focus();
  };
  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus() }));

  // 입력량에 맞춰 높이 자동 조절
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const submit = () => {
    if (!text.trim() || streaming || disabled) return;
    onSend(text, tool?.name);
    setText('');
    // 도구는 한 번 쓰고 해제 (다음 질문은 평소처럼)
    setTool(null);
  };

  // 전송/중지 버튼 — 컨트롤 sm 크기 (35px)
  const btn = 'flex size-(--control-height-sm) shrink-0 items-center justify-center rounded-sm transition-colors';

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-3 sm:px-4 sm:pb-4">
      <div
        className={cx(
          'relative rounded-sm border border-line-strong bg-surface-0 p-1.5 shadow-sm transition-colors',
          'focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20',
        )}
      >
        {tool && (
          <div className="mb-1 flex">
            <span className="tint-brand inline-flex h-6 items-center gap-1 rounded-full pr-1 pl-2.5 text-xs text-brand">
              {tool.emoji} {tool.title}
              <button
                onClick={() => pickTool(null)}
                aria-label="도구 해제"
                className="flex size-4 items-center justify-center rounded-full hover:bg-brand/15"
              >
                <RiCloseLine size={12} />
              </button>
            </span>
          </div>
        )}
        <div className="flex items-end gap-1">
        {tools.length > 0 && (
          <div ref={menuRef} className="relative shrink-0">
            <IconButton
              label="도구 선택"
              size="sm"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
              className={cx(tool && 'text-brand')}
            >
              <RiToolsLine size={ICON.md} />
            </IconButton>
            {menu && (
              <div
                role="menu"
                className="absolute bottom-full left-0 z-(--z-dropdown) mb-2 w-72 rounded-sm border border-line bg-elevated p-1 shadow-md"
              >
                <p className="px-2.5 pt-1.5 pb-1 text-xs text-fg-muted">도구와 함께 질문하기</p>
                {tools.map((t) => (
                  <button
                    key={t.name}
                    role="menuitem"
                    onClick={() => pickTool(t)}
                    className={cx(
                      'flex w-full items-start gap-2.5 rounded-xs px-2.5 py-2 text-left transition-colors hover:bg-surface-2',
                      tool?.name === t.name && 'bg-surface-2',
                    )}
                  >
                    <span className="text-base leading-5">{t.emoji}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fg">{t.title}</span>
                      <span className="block text-xs font-normal text-fg-muted">{t.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <textarea
          ref={ta}
          value={text}
          rows={1}
          autoFocus={!matchMedia('(pointer: coarse)').matches}
          placeholder={tool?.placeholder ?? placeholder ?? '두나에게 질문하세요…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 한글 조합 중 Enter는 무시 (조합 확정용)
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === 'Escape' && tool) return setTool(null);
            // 빈 입력창에서 Backspace 로 도구 해제
            if (e.key === 'Backspace' && !text && tool) return setTool(null);
            const mobile = matchMedia('(pointer: coarse)').matches;
            if (e.key === 'Enter' && !e.shiftKey && !mobile) {
              e.preventDefault();
              submit();
            }
          }}
          className="scrollbar-thin max-h-60 min-h-(--control-height-sm) flex-1 resize-none bg-transparent px-(--control-pad-x-input-sm) py-1.5 text-base text-fg outline-none placeholder:text-fg-muted focus-visible:outline-none"
        />
        {streaming ? (
          <button onClick={onStop} aria-label="중지" title="중지" className={cx(btn, 'bg-fg text-surface-0 hover:opacity-80')}>
            <RiStopFill size={ICON.sm} />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!text.trim() || disabled}
            aria-label="보내기"
            title="보내기 (Enter)"
            className={cx(btn, 'bg-brand text-white hover:bg-brand-hover disabled:bg-surface-2 disabled:text-fg-disabled')}
          >
            <RiArrowUpLine size={ICON.md} />
          </button>
        )}
        </div>
      </div>
      <p className="mt-1.5 hidden text-center text-xs font-normal text-fg-muted sm:block">
        Enter 전송 · Shift+Enter 줄바꿈 · AI 답변은 틀릴 수 있으니 중요한 내용은 확인하세요.
      </p>
    </div>
  );
});
