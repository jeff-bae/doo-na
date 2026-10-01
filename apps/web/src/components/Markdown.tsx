import { memo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { RiCheckLine, RiFileCopyLine } from '@remixicon/react';
import { copyText } from '../lib/clipboard';
import { isTauri } from '../lib/platform';
import { ICON } from './ui';

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = children as { props?: { className?: string; children?: ReactNode } } | undefined;
  const lang = /language-([\w+-]+)/.exec(code?.props?.className ?? '')?.[1] ?? '';

  const onCopy = async () => {
    if (await copyText(textOf(code?.props?.children).replace(/\n$/, ''))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    // 코드 블록은 테마와 관계없이 어둡게 (github-dark 하이라이트) — 토큰 dark 팔레트 값 사용
    <div className="my-3 overflow-hidden rounded-sm border border-[#2A2A34] bg-[#131318] text-[#F5F5F7]">
      <div className="flex h-(--control-height-xs) items-center justify-between bg-[#1C1C24] pr-1 pl-3 text-xs text-[#A0A0AE]">
        <span className="font-mono">{lang || 'code'}</span>
        <button
          onClick={onCopy}
          className="flex h-6 items-center gap-1 rounded-xs px-2 transition-colors hover:bg-[#2A2A34] hover:text-[#F5F5F7]"
        >
          {copied ? <RiCheckLine size={ICON.sm} /> : <RiFileCopyLine size={ICON.sm} />}
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <pre className="scrollbar-thin overflow-x-auto p-4 font-mono text-[13px] leading-6 selection:text-[#14141A]">{children}</pre>
    </div>
  );
}

const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => {
        // Windows 앱에서는 기본 브라우저로 연다
        if (isTauri && href) {
          e.preventDefault();
          void import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(href));
        }
      }}
    >
      {children}
    </a>
  ),
};

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
});
