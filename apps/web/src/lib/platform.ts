/** Tauri(Windows 앱) WebView 안에서 실행 중인지 */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 홈 화면에 설치된 PWA로 실행 중인지 */
export const isStandalone =
  typeof window !== 'undefined' &&
  (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
