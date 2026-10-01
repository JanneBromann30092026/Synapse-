/**
 * iOS startup images (apple-touch-startup-image) for current iPad sizes. iOS only shows a
 * startup image whose media query matches the device exactly, so every size needs its own
 * file in portrait and landscape. Shared by scripts/generate-icons.ts and vite.config.ts.
 */
export interface SplashDevice {
  /** CSS pixels in portrait orientation. */
  width: number;
  height: number;
  ratio: number;
}

export const SPLASH_DEVICES: SplashDevice[] = [
  { width: 1032, height: 1376, ratio: 2 }, // iPad Pro 13" (M4), iPad Air 13"
  { width: 1024, height: 1366, ratio: 2 }, // iPad Pro 12.9"
  { width: 834, height: 1210, ratio: 2 }, // iPad Pro 11" (M4)
  { width: 834, height: 1194, ratio: 2 }, // iPad Pro 11", iPad Air 11"
  { width: 820, height: 1180, ratio: 2 }, // iPad Air 10.9", iPad 10th gen
  { width: 834, height: 1112, ratio: 2 }, // iPad Air 10.5"
  { width: 810, height: 1080, ratio: 2 }, // iPad 10.2"
  { width: 768, height: 1024, ratio: 2 }, // iPad 9.7", iPad mini 5
  { width: 744, height: 1133, ratio: 2 }, // iPad mini 6/7
];

export const SPLASH_THEMES = ['dark', 'light'] as const;
export type SplashTheme = (typeof SPLASH_THEMES)[number];
export type SplashOrientation = 'portrait' | 'landscape';

/** Background colors of the startup images (= --bg of both themes). */
export const SPLASH_BACKGROUND: Record<SplashTheme, string> = {
  dark: '#0B0D12',
  light: '#F5F6F8',
};

export function splashFileName(
  device: SplashDevice,
  orientation: SplashOrientation,
  theme: SplashTheme,
): string {
  const w = device.width * device.ratio;
  const h = device.height * device.ratio;
  const [pw, ph] = orientation === 'portrait' ? [w, h] : [h, w];
  return `splash-${pw}x${ph}-${theme}.png`;
}

export function splashMedia(
  device: SplashDevice,
  orientation: SplashOrientation,
  theme: SplashTheme,
): string {
  return [
    `(device-width: ${device.width}px)`,
    `(device-height: ${device.height}px)`,
    `(-webkit-device-pixel-ratio: ${device.ratio})`,
    `(orientation: ${orientation})`,
    `(prefers-color-scheme: ${theme})`,
  ].join(' and ');
}
