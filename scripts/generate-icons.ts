/**
 * Generates the PNG app icons and iOS startup images from public/icons/favicon.svg.
 * Run once after changing the SVG: npm run icons
 */
import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  SPLASH_BACKGROUND,
  SPLASH_DEVICES,
  SPLASH_THEMES,
  splashFileName,
  type SplashOrientation,
} from './splashScreens.ts';

const dir = new URL('../public/icons/', import.meta.url);
const splashDir = new URL('../public/splash/', import.meta.url);
const svg = readFileSync(new URL('favicon.svg', dir));
const BACKGROUND = '#0B0D12';

async function render(size: number, file: string, padding = 0): Promise<void> {
  const inner = Math.round(size * (1 - padding * 2));
  const icon = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toFile(new URL(file, dir).pathname);
  console.log(`✓ ${file}`);
}

// Regular icons: the rounded square fills the canvas (corners on dark background).
await render(192, 'pwa-192x192.png');
await render(512, 'pwa-512x512.png');
// Maskable: keep the motif within the 80 % safe zone.
await render(512, 'maskable-icon-512x512.png', 0.1);
// iOS applies its own rounded mask and does not support transparency.
await render(180, 'apple-touch-icon-180x180.png');

// Startup images: theme background with the icon (128 CSS px) in the middle.
mkdirSync(splashDir, { recursive: true });
const orientations: SplashOrientation[] = ['portrait', 'landscape'];
for (const device of SPLASH_DEVICES) {
  const iconSize = 128 * device.ratio;
  const icon = await sharp(svg, { density: 384 }).resize(iconSize, iconSize).png().toBuffer();
  for (const orientation of orientations) {
    for (const theme of SPLASH_THEMES) {
      const w = device.width * device.ratio;
      const h = device.height * device.ratio;
      const [width, height] = orientation === 'portrait' ? [w, h] : [h, w];
      const file = splashFileName(device, orientation, theme);
      await sharp({
        create: { width, height, channels: 3, background: SPLASH_BACKGROUND[theme] },
      })
        .composite([{ input: icon, gravity: 'center' }])
        .png({ palette: true, compressionLevel: 9 })
        .toFile(new URL(file, splashDir).pathname);
      console.log(`✓ splash/${file}`);
    }
  }
}
