import { create } from 'zustand';
import type { User } from '@doona/shared';
import { api, getToken, setToken, setUnauthorizedHandler } from '../lib/api';
import { useChat } from './chat';

interface AuthState {
  status: 'loading' | 'guest' | 'authed';
  user: User | null;
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  user: null,

  async init() {
    if (!getToken()) return set({ status: 'guest' });
    try {
      set({ status: 'authed', user: await api.me() });
    } catch (err) {
      // 오프라인 등 일시적 오류면 토큰을 지우지 않고 다시 로그인 화면으로
      if ((err as { status?: number }).status === 401) setToken(null);
      set({ status: 'guest', user: null });
    }
  },

  async login(username, password) {
    const res = await api.login(username, password);
    setToken(res.token);
    set({ status: 'authed', user: res.user });
  },

  async logout() {
    await api.logout().catch(() => {});
    setToken(null);
    // 다음 사용자에게 이전 대화가 보이지 않도록
    useChat.getState().reset();
    set({ status: 'guest', user: null });
  },

  async changePassword(current, next) {
    const res = await api.changePassword(current, next);
    setToken(res.token);
  },
}));

setUnauthorizedHandler(() => {
  setToken(null);
  useChat.getState().reset();
  useAuth.setState({ status: 'guest', user: null });
});
