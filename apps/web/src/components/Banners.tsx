import { useEffect, useState } from 'react';
import { RiWifiOffLine } from '@remixicon/react';
import { Button, ICON } from './ui';
import { api } from '../lib/api';
import { isTauri } from '../lib/platform';

/** 오프라인이거나 AI 서버(Ollama)가 응답하지 않을 때 상단에 표시 */
export function ConnectionBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [ollama, setOllama] = useState(true);

  useEffect(() => {
    const check = () =>
      api.health().then(
        (h) => {
          setOnline(true);
          setOllama(h.ollama);
        },
        () => setOnline(false),
      );
    const up = () => void check();
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    void check();
    const t = setInterval(check, 30_000);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      clearInterval(t);
    };
  }, []);

  if (online && ollama) return null;
  return (
    <div className="safe-top flex items-center justify-center gap-2 bg-state-warning px-3 py-1.5 text-sm font-medium text-white">
      <RiWifiOffLine size={ICON.sm} />
      {online ? 'AI 서버가 응답하지 않습니다. 잠시 후 다시 시도하세요.' : '서버에 연결할 수 없습니다. 네트워크를 확인하세요.'}
    </div>
  );
}

/** 새 버전이 배포되면 새로고침 안내 (PWA 전용) */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<null | (() => void)>(null);

  useEffect(() => {
    if (isTauri || import.meta.env.DEV) return;
    let cancelled = false;
    import('virtual:pwa-register').then(({ registerSW }) => {
      if (cancelled) return;
      const updateSW = registerSW({
        onNeedRefresh: () => setUpdate(() => () => void updateSW(true)),
        onRegisteredSW: (_url, reg) => {
          // 1시간마다 새 버전 확인
          if (reg) setInterval(() => void reg.update(), 3_600_000);
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-(--z-toast) flex -translate-x-1/2 items-center gap-3 rounded-sm border border-line bg-elevated py-2 pr-2 pl-4 text-sm text-fg shadow-lg">
      새 버전이 있습니다.
      <Button size="xs" onClick={update}>
        업데이트
      </Button>
    </div>
  );
}
