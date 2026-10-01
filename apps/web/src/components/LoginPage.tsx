import { useState, type FormEvent } from 'react';
import { api, getServerUrl, setServerUrl } from '../lib/api';
import { isTauri } from '../lib/platform';
import { useAuth } from '../store/auth';
import { Button, ErrorText, Field, Input, Spinner } from './ui';

export function LoginPage() {
  const login = useAuth((s) => s.login);
  const [server, setServer] = useState(getServerUrl());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isTauri) {
        if (!/^https?:\/\/.+/.test(server.trim())) throw new Error('서버 주소를 http:// 또는 https:// 로 시작하게 입력하세요.');
        setServerUrl(server);
        await api.health();
      }
      await login(username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="safe-top safe-bottom flex min-h-full items-center justify-center bg-surface-1 px-4">
      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-sm space-y-5 overflow-hidden rounded-sm border border-line bg-elevated p-7 shadow-md"
      >
        {/* 브랜드 그라디언트 띠 */}
        <div className="absolute inset-x-0 top-0 h-1 bg-(image:--brand-gradient)" aria-hidden />
        <div className="flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" className="mb-3 size-14" />
          <h1 className="text-h3">두나 Doona</h1>
          <p className="mt-1 text-sm text-fg-2">계정으로 로그인하세요</p>
        </div>

        {isTauri && (
          <Field label="서버 주소" hint="예: https://doona.example.ts.net">
            <Input value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://" inputMode="url" />
          </Field>
        )}
        <Field label="아이디">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </Field>
        <Field label="비밀번호">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        <ErrorText>{error}</ErrorText>

        <Button type="submit" disabled={busy} className="w-full">
          {busy && <Spinner />} 로그인
        </Button>
        <p className="text-center text-xs font-normal text-fg-muted">계정이 없으면 관리자에게 요청하세요.</p>
      </form>
    </div>
  );
}
