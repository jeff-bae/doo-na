import { create } from 'zustand';
import { storage } from '../lib/storage';

export type Theme = 'system' | 'light' | 'dark';

const media = matchMedia('(prefers-color-scheme: dark)');

function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && media.matches);
  // 토큰(tokens.css)과 Tailwind dark 변형 모두 data-theme 기준
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // --surface-0 값과 맞춤
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B0B10' : '#FFFFFF');
}

export const useTheme = create<{ theme: Theme; setTheme: (t: Theme) => void }>((set) => ({
  theme: (storage.get('doona.theme') as Theme) || 'system',
  setTheme(theme) {
    storage.set('doona.theme', theme);
    apply(theme);
    set({ theme });
  },
}));

apply(useTheme.getState().theme);
media.addEventListener('change', () => apply(useTheme.getState().theme));
