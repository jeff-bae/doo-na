/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Windows 앱 기본 서버 주소 */
  readonly VITE_DEFAULT_SERVER?: string;
}
