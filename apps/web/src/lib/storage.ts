// localStorage 접근 — 사생활 보호 모드 등에서 예외가 날 수 있어 감싼다.
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* 무시 */
    }
  },
};
