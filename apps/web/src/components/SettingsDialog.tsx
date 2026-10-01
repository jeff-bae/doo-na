import { useEffect, useState, type FormEvent } from 'react';
import { RiComputerLine, RiDeleteBinLine, RiMoonLine, RiSunLine } from '@remixicon/react';
import type { User } from '@doona/shared';
import { api, getServerUrl } from '../lib/api';
import { isTauri } from '../lib/platform';
import { useAuth } from '../store/auth';
import { useTheme, type Theme } from '../store/theme';
import { Button, ErrorText, Field, ICON, IconButton, Input, Modal, SuccessText, cx } from './ui';

type Tab = 'general' | 'account' | 'users';

function General() {
  const { theme, setTheme } = useTheme();
  const options: { value: Theme; label: string; icon: typeof RiSunLine }[] = [
    { value: 'system', label: '시스템', icon: RiComputerLine },
    { value: 'light', label: '라이트', icon: RiSunLine },
    { value: 'dark', label: '다크', icon: RiMoonLine },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-medium">테마</h3>
        <div className="grid grid-cols-3 gap-2">
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cx(
                'flex flex-col items-center gap-1.5 rounded-sm border p-3 text-sm transition-colors',
                theme === value
                  ? 'tint-brand border-brand text-brand'
                  : 'border-line text-fg-2 hover:border-line-strong hover:bg-surface-1',
              )}
            >
              <Icon size={ICON.md} />
              {label}
            </button>
          ))}
        </div>
      </div>
      {isTauri && (
        <div>
          <h3 className="mb-1 text-sm font-medium">서버</h3>
          <p className="text-sm break-all text-fg-2">{getServerUrl()}</p>
          <p className="mt-1 text-xs font-normal text-fg-muted">서버를 바꾸려면 로그아웃 후 로그인 화면에서 변경하세요.</p>
        </div>
      )}
      <div className="text-xs font-normal text-fg-muted">두나 v{__APP_VERSION__}</div>
    </div>
  );
}

function Account() {
  const changePassword = useAuth((s) => s.changePassword);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setMsg({ ok: false, text: '새 비밀번호가 일치하지 않습니다.' });
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setMsg({ ok: true, text: '비밀번호를 변경했습니다. 다른 기기에서는 다시 로그인해야 합니다.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="현재 비밀번호">
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </Field>
      <Field label="새 비밀번호" hint="8자 이상">
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="새 비밀번호 확인">
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      </Field>
      {msg &&
        (msg.ok ? (
          <SuccessText>{msg.text}</SuccessText>
        ) : (
          <ErrorText>{msg.text}</ErrorText>
        ))}
      <Button type="submit" size="sm">
        비밀번호 변경
      </Button>
    </form>
  );
}

function Users() {
  const me = useAuth((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPw, setResetPw] = useState('');

  const load = () => api.users().then(setUsers, (e: Error) => setError(e.message));
  useEffect(() => void load(), []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.createUser(username.trim(), password, isAdmin);
      setUsername('');
      setPassword('');
      setIsAdmin(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const reset = async (e: FormEvent, u: User) => {
    e.preventDefault();
    try {
      await api.resetPassword(u.id, resetPw);
      setError('');
      setInfo(`${u.username}의 비밀번호를 초기화했습니다.`);
      setResetId(null);
      setResetPw('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.deleteUser(id);
      setConfirmId(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={add} className="space-y-3 rounded-sm border border-line bg-surface-1 p-4">
        <h3 className="text-sm font-medium">사용자 추가</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="아이디" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <Input
            placeholder="초기 비밀번호 (8자 이상)"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="size-4 rounded-xs accent-(--brand-indigo)"
            />
            관리자 권한
          </label>
          <Button type="submit" size="sm">
            추가
          </Button>
        </div>
      </form>

      <ErrorText>{error}</ErrorText>
      <SuccessText>{info}</SuccessText>

      <ul className="divide-y divide-line">
        {users.map((u) =>
          resetId === u.id ? (
            <li key={u.id} className="py-2.5">
              <form onSubmit={(e) => void reset(e, u)} className="flex items-center gap-2">
                <span className="shrink-0 text-sm font-medium">{u.username}</span>
                <Input
                  autoFocus
                  type="password"
                  autoComplete="new-password"
                  placeholder="새 비밀번호 (8자 이상)"
                  minLength={8}
                  required
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                />
                <Button type="submit" size="sm">
                  저장
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setResetId(null)}>
                  취소
                </Button>
              </form>
            </li>
          ) : (
          <li key={u.id} className="flex items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {u.username}
                {u.isAdmin && (
                  <span className="tint-brand ml-2 rounded-full px-2 py-0.5 text-xs text-brand">
                    관리자
                  </span>
                )}
              </p>
              <p className="text-xs font-normal text-fg-muted">{new Date(u.createdAt).toLocaleDateString('ko-KR')} 가입</p>
            </div>
            <Button variant="secondary" size="xs" onClick={() => {
                setResetId(u.id);
                setResetPw('');
                setInfo('');
              }}>
              비밀번호 초기화
            </Button>
            {u.id !== me?.id &&
              (confirmId === u.id ? (
                <Button variant="danger" size="xs" onClick={() => void remove(u.id)}>
                  삭제 확인
                </Button>
              ) : (
                <IconButton label="삭제" size="xs" onClick={() => setConfirmId(u.id)}>
                  <RiDeleteBinLine size={ICON.sm} />
                </IconButton>
              ))}
          </li>
          ),
        )}
      </ul>
    </div>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<Tab>('general');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: '일반' },
    { id: 'account', label: '계정' },
    ...(user?.isAdmin ? [{ id: 'users' as const, label: '사용자 관리' }] : []),
  ];

  return (
    <Modal open={open} onClose={onClose} title="설정" wide>
      <div className="mb-5 flex border-b border-line" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              '-mb-px h-(--control-height-md) border-b-2 px-4 text-sm font-medium transition-colors',
              tab === t.id ? 'border-brand text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'general' && <General />}
      {tab === 'account' && <Account />}
      {tab === 'users' && user?.isAdmin && <Users />}
    </Modal>
  );
}
