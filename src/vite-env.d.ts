/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

interface Navigator {
  /** iOS Safari: true when launched from the home screen. */
  readonly standalone?: boolean;
}
