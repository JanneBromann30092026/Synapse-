/**
 * Generates the PNG app icons from public/icons/favicon.svg.
 * Run once after changing the SVG: npm run icons
 */
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const dir = new URL('../public/icons/', import.meta.url);
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
