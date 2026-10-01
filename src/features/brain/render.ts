import {
  curveControl,
  curvePoint,
  MASTERY_STYLE,
  type BrainGraph,
  type BrainLink,
  type BrainNode,
} from '@/core/brain/graph';
import {
  LABEL_MIN_ZOOM,
  placeLabels,
  truncateLabel,
  type LabelBox,
  type LabelCandidate,
} from '@/core/brain/labels';
import { PROJECT_COLORS, type ProjectColor } from '@/data/types';

/**
 * Canvas renderer of the brain. force-graph only provides canvas, zoom/pan and the simulation;
 * everything is drawn here in one pass per frame: links batched into few paths per color,
 * nodes as pre-rendered sprites (no shadowBlur – very expensive on Safari), labels in screen
 * space. Off-screen links and nodes are skipped.
 */

export interface Palette {
  dark: boolean;
  project: Record<ProjectColor, string>;
  accent: string;
  labelBg: string;
  labelFg: string;
  labelBorder: string;
  impulse: string;
}

/** Reads the colors from the design tokens (they differ between light and dark mode). */
export function readPalette(dark: boolean): Palette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const project = Object.fromEntries(
    PROJECT_COLORS.map((color) => [color, token(`--project-${color}`, '#6366f1')]),
  ) as Record<ProjectColor, string>;
  return {
    dark,
    project,
    accent: token('--accent', '#6d5ef5'),
    labelBg: dark ? 'rgba(18, 21, 28, 0.78)' : 'rgba(255, 255, 255, 0.86)',
    labelFg: token('--fg', dark ? '#eceef3' : '#10131a'),
    labelBorder: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 20, 30, 0.08)',
    impulse: dark ? '#ffffff' : token('--accent', '#6d5ef5'),
  };
}

// Sprites --------------------------------------------------------------------------------

const GLOW_SIZE = 128;
const DISC_SIZE = 64;
const sprites = new Map<string, HTMLCanvasElement>();

function rgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return `rgba(109, 94, 245, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function sprite(key: string, size: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  let canvas = sprites.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) paint(ctx);
    sprites.set(key, canvas);
  }
  return canvas;
}

/** Soft radial glow (drawn at 4–5× the node radius). */
function glowSprite(color: string): HTMLCanvasElement {
  return sprite(`glow:${color}`, GLOW_SIZE, (ctx) => {
    const half = GLOW_SIZE / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, rgba(color, 0.85));
    gradient.addColorStop(0.22, rgba(color, 0.42));
    gradient.addColorStop(0.55, rgba(color, 0.1));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  });
}

/** Solid node disc with a slightly lighter center. */
function discSprite(color: string): HTMLCanvasElement {
  return sprite(`disc:${color}`, DISC_SIZE, (ctx) => {
    const half = DISC_SIZE / 2;
    const gradient = ctx.createRadialGradient(half * 0.8, half * 0.75, 0, half, half, half);
    gradient.addColorStop(0, rgba('#ffffff', 1));
    gradient.addColorStop(0.18, color);
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Scene ----------------------------------------------------------------------------------

/** Curvature of cross-project links (fraction of their length). */
export const CROSS_CURVATURE = 0.16;
/** Above this many visible cross-project links they are drawn without gradients. */
const MAX_GRADIENT_LINKS = 400;

interface LinkBucket {
  color: ProjectColor;
  alpha: number;
  links: BrainLink[];
}

export interface Scene {
  hubs: BrainNode[];
  /** Cards grouped by color and mastery level (one fill per group). */
  discGroups: { color: ProjectColor; level: BrainNode['level']; cards: BrainNode[] }[];
  cards: BrainNode[];
  hubLinks: LinkBucket[];
  intra: LinkBucket[];
  cross: BrainLink[];
  manual: BrainLink[];
  /** Fewer, fainter lines when there are many (avoids a grey haze when zoomed out). */
  density: number;
}

/** Weight 0.5..1 → one of four opacity steps. */
function weightStep(weight: number): number {
  return Math.max(0, Math.min(3, Math.floor(((weight - 0.5) / 0.5) * 4)));
}

/** Groups the links once per graph update (not per frame). */
export function buildScene(graph: BrainGraph): Scene {
  const hubs: BrainNode[] = [];
  const cards: BrainNode[] = [];
  for (const node of graph.nodes) (node.kind === 'hub' ? hubs : cards).push(node);

  const hubLinks = new Map<string, LinkBucket>();
  const intra = new Map<string, LinkBucket>();
  const cross: BrainLink[] = [];
  const manual: BrainLink[] = [];
  let semantic = 0;
  for (const link of graph.links) {
    if (link.kind === 'hub') {
      const bucket = hubLinks.get(link.a.color);
      if (bucket) bucket.links.push(link);
      else hubLinks.set(link.a.color, { color: link.a.color, alpha: 1, links: [link] });
    } else if (link.kind === 'manual') {
      manual.push(link);
    } else if (link.cross) {
      cross.push(link);
      semantic += 1;
    } else {
      const step = weightStep(link.weight);
      const key = `${link.a.color}:${step}`;
      const bucket = intra.get(key);
      if (bucket) bucket.links.push(link);
      else intra.set(key, { color: link.a.color, alpha: 0.12 + step * 0.1, links: [link] });
      semantic += 1;
    }
  }
  const discGroups = new Map<string, Scene['discGroups'][number]>();
  for (const card of cards) {
    const key = `${card.color}:${card.level}`;
    const group = discGroups.get(key);
    if (group) group.cards.push(card);
    else discGroups.set(key, { color: card.color, level: card.level, cards: [card] });
  }
  return {
    hubs,
    discGroups: [...discGroups.values()],
    cards,
    hubLinks: [...hubLinks.values()],
    intra: [...intra.values()],
    cross,
    manual,
    density: Math.max(0.4, Math.min(1, Math.sqrt(1500 / Math.max(1, semantic)))),
  };
}

// Frame ----------------------------------------------------------------------------------

export interface Impulse {
  link: BrainLink;
  /** performance.now() at start. */
  start: number;
  duration: number;
}

export interface FrameInput {
  /** Zoom factor (globalScale). */
  k: number;
  now: number;
  palette: Palette;
  impulses: readonly Impulse[];
  /** Node currently moved by long press + drag. */
  dragId: string | null;
  /** Multiplies every opacity (dimming in focus mode, cross-fades between filters). */
  opacity?: number;
  /** 'all' labels the cards regardless of the zoom (focus overlay); default 'auto'. */
  labels?: 'auto' | 'all' | 'none';
  /** Focused node: drawn larger with a ring; t = 0..1 animation progress. */
  emphasis?: { id: string; t: number } | null;
  /** Node under the mouse pointer. */
  hoverId?: string | null;
  /** Link whose popover is open. */
  selectedLinkId?: string | null;
  /** Search hits: expanding rings for a moment. */
  pulses?: readonly Pulse[];
  /** performance.now() when a manual link appeared (drawn growing). */
  linkBorn?: ReadonlyMap<string, number>;
}

export interface Pulse {
  ids: ReadonlySet<string>;
  start: number;
}

export const PULSE_MS = 1600;
export const LINK_GROW_MS = 650;

interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const FADE_MS = 600;
const LABEL_FONT = "600 12px 'Inter Variable', system-ui, sans-serif";
const HUB_FONT = "650 14px 'Inter Variable', system-ui, sans-serif";
const LABEL_HEIGHT = 22;
const HUB_LABEL_HEIGHT = 28;

const textWidths = new Map<string, number>();

function measure(ctx: CanvasRenderingContext2D, font: string, text: string): number {
  const key = `${font}|${text}`;
  let width = textWidths.get(key);
  if (width === undefined) {
    if (textWidths.size > 6000) textWidths.clear();
    ctx.font = font;
    width = ctx.measureText(text).width;
    textWidths.set(key, width);
  }
  return width;
}

function fade(node: BrainNode, now: number): number {
  if (node.bornAt === 0) return 1;
  const t = Math.min(1, Math.max(0, (now - node.bornAt) / FADE_MS));
  return t * (2 - t);
}

const pos = (node: BrainNode) => ({ x: node.x ?? 0, y: node.y ?? 0 });

function segmentVisible(a: BrainNode, b: BrainNode, view: View): boolean {
  const ax = a.x ?? 0;
  const ay = a.y ?? 0;
  const bx = b.x ?? 0;
  const by = b.y ?? 0;
  return !(
    Math.max(ax, bx) < view.x0 ||
    Math.min(ax, bx) > view.x1 ||
    Math.max(ay, by) < view.y0 ||
    Math.min(ay, by) > view.y1
  );
}

function nodeVisible(node: BrainNode, view: View, margin: number): boolean {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  return (
    x + margin >= view.x0 && x - margin <= view.x1 && y + margin >= view.y0 && y - margin <= view.y1
  );
}

function strokeBucket(
  ctx: CanvasRenderingContext2D,
  links: readonly BrainLink[],
  view: View,
): number {
  let drawn = 0;
  ctx.beginPath();
  for (const link of links) {
    if (!segmentVisible(link.a, link.b, view)) continue;
    ctx.moveTo(link.a.x ?? 0, link.a.y ?? 0);
    ctx.lineTo(link.b.x ?? 0, link.b.y ?? 0);
    drawn += 1;
  }
  if (drawn > 0) ctx.stroke();
  return drawn;
}

function curve(ctx: CanvasRenderingContext2D, link: BrainLink): void {
  const a = pos(link.a);
  const b = pos(link.b);
  const control = curveControl(a, b, CROSS_CURVATURE);
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.closePath();
}

/** Draws one frame. Expects the zoom/pan transform of force-graph on the context. */
export function drawFrame(ctx: CanvasRenderingContext2D, scene: Scene, frame: FrameInput): void {
  const { k, now, palette } = frame;
  const o = frame.opacity ?? 1;
  if (o <= 0.001) return;
  const m = ctx.getTransform();
  const dpr = m.a / k;
  const margin = 40 / k;
  const view: View = {
    x0: -m.e / m.a - margin,
    y0: -m.f / m.d - margin,
    x1: (ctx.canvas.width - m.e) / m.a + margin,
    y1: (ctx.canvas.height - m.f) / m.d + margin,
  };
  const light = palette.dark ? 1 : 1.25;

  ctx.save();
  ctx.lineCap = 'round';

  // 1. Card → hub: barely visible threads that show the clusters.
  ctx.lineWidth = 0.8 / k;
  ctx.globalAlpha = o * ((palette.dark ? 0.045 : 0.07) * scene.density);
  for (const bucket of scene.hubLinks) {
    ctx.strokeStyle = palette.project[bucket.color];
    strokeBucket(ctx, bucket.links, view);
  }

  // 2. Links within a project: thin, opacity by similarity.
  ctx.lineWidth = 1 / k;
  for (const bucket of scene.intra) {
    ctx.globalAlpha = o * Math.min(1, bucket.alpha * scene.density * light);
    ctx.strokeStyle = palette.project[bucket.color];
    strokeBucket(ctx, bucket.links, view);
  }

  // 3. Cross-project links: curved, gradient between both project colors.
  ctx.lineWidth = 1.7 / k;
  ctx.globalAlpha = o * ((palette.dark ? 0.62 : 0.7) * Math.max(0.6, scene.density));
  const visibleCross = scene.cross.filter((link) => segmentVisible(link.a, link.b, view));
  if (visibleCross.length <= MAX_GRADIENT_LINKS) {
    for (const link of visibleCross) {
      const gradient = ctx.createLinearGradient(
        link.a.x ?? 0,
        link.a.y ?? 0,
        link.b.x ?? 0,
        link.b.y ?? 0,
      );
      gradient.addColorStop(0, palette.project[link.a.color]);
      gradient.addColorStop(1, palette.project[link.b.color]);
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      curve(ctx, link);
      ctx.stroke();
    }
  } else {
    const byColor = new Map<ProjectColor, BrainLink[]>();
    for (const link of visibleCross) {
      const list = byColor.get(link.a.color);
      if (list) list.push(link);
      else byColor.set(link.a.color, [link]);
    }
    for (const [color, links] of byColor) {
      ctx.strokeStyle = palette.project[color];
      ctx.beginPath();
      for (const link of links) curve(ctx, link);
      ctx.stroke();
    }
  }

  // 4. Manual links: dashed in the accent color.
  if (scene.manual.length > 0) {
    const born = frame.linkBorn;
    const growing = (link: BrainLink) => {
      const start = born?.get(link.id);
      return start !== undefined && now - start < LINK_GROW_MS;
    };
    ctx.globalAlpha = o * 0.85;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.5 / k;
    ctx.setLineDash([5 / k, 4 / k]);
    strokeBucket(ctx, born ? scene.manual.filter((link) => !growing(link)) : scene.manual, view);
    // New manual links grow from the focused card to their target.
    ctx.beginPath();
    for (const link of scene.manual) {
      const start = born?.get(link.id);
      if (start === undefined || !growing(link)) continue;
      const t = (now - start) / LINK_GROW_MS;
      const eased = 1 - (1 - t) ** 3;
      const a = pos(link.a);
      const b = pos(link.b);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + (b.x - a.x) * eased, a.y + (b.y - a.y) * eased);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 5. Glows (additive in dark mode), then node discs.
  ctx.globalCompositeOperation = palette.dark ? 'lighter' : 'source-over';
  const glowFactor = palette.dark ? 1 : 0.45;
  for (const hub of scene.hubs) {
    if (!nodeVisible(hub, view, hub.radius * 6)) continue;
    const r = hub.radius * 5.5;
    ctx.globalAlpha = o * (0.55 * glowFactor * fade(hub, now));
    ctx.drawImage(
      glowSprite(palette.project[hub.color]),
      (hub.x ?? 0) - r,
      (hub.y ?? 0) - r,
      r * 2,
      r * 2,
    );
  }
  const minRadius = 1.3 / k;
  for (const card of scene.cards) {
    const glow = MASTERY_STYLE[card.level].glow;
    if (glow === 0 || !nodeVisible(card, view, card.radius * 5)) continue;
    const r = Math.max(card.radius, minRadius) * 4.2;
    ctx.globalAlpha = o * (glow * 0.7 * glowFactor * fade(card, now));
    ctx.drawImage(
      glowSprite(palette.project[card.color]),
      (card.x ?? 0) - r,
      (card.y ?? 0) - r,
      r * 2,
      r * 2,
    );
  }
  ctx.globalCompositeOperation = 'source-over';

  // Discs: one path per color and mastery level (thousands of drawImage calls are slow).
  for (const group of scene.discGroups) {
    ctx.fillStyle = palette.project[group.color];
    ctx.globalAlpha = o * MASTERY_STYLE[group.level].core;
    ctx.beginPath();
    let any = false;
    for (const card of group.cards) {
      if (card.bornAt !== 0 && now - card.bornAt < FADE_MS) continue;
      if (!nodeVisible(card, view, card.radius)) continue;
      const r = Math.max(card.radius, minRadius);
      ctx.moveTo((card.x ?? 0) + r, card.y ?? 0);
      ctx.arc(card.x ?? 0, card.y ?? 0, r, 0, Math.PI * 2);
      any = true;
    }
    if (any) ctx.fill();
  }
  // Nodes that are still fading in, one by one.
  for (const card of scene.cards) {
    if (card.bornAt === 0 || now - card.bornAt >= FADE_MS) continue;
    const r = Math.max(card.radius, minRadius);
    ctx.globalAlpha = o * (MASTERY_STYLE[card.level].core * fade(card, now));
    ctx.fillStyle = palette.project[card.color];
    ctx.beginPath();
    ctx.arc(card.x ?? 0, card.y ?? 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // A bright center on solid cards when zoomed in (the "lit" look).
  if (k > 1.2) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = o * (palette.dark ? 0.7 : 0.55);
    ctx.beginPath();
    for (const card of scene.cards) {
      if (card.level !== 'solid' || !nodeVisible(card, view, card.radius)) continue;
      const r = card.radius * 0.32;
      ctx.moveTo((card.x ?? 0) + r, card.y ?? 0);
      ctx.arc(card.x ?? 0, card.y ?? 0, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  for (const hub of scene.hubs) {
    if (!nodeVisible(hub, view, hub.radius)) continue;
    const alpha = fade(hub, now);
    const x = hub.x ?? 0;
    const y = hub.y ?? 0;
    const color = palette.project[hub.color];
    // Translucent body, bright ring, glowing core – a "nucleus" for the cluster.
    ctx.globalAlpha = o * ((palette.dark ? 0.28 : 0.2) * alpha);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, hub.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = o * alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2 / k, hub.radius * 0.12);
    ctx.stroke();
    const core = hub.radius * 0.42;
    ctx.drawImage(discSprite(color), x - core, y - core, core * 2, core * 2);
    ctx.globalAlpha = o * (0.35 * alpha);
    ctx.strokeStyle = palette.dark ? '#ffffff' : color;
    ctx.lineWidth = 1 / k;
    ctx.beginPath();
    ctx.arc(x, y, hub.radius + 5 / k, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 6. Impulses: small lights travelling along cross-project links.
  if (frame.impulses.length > 0) {
    ctx.globalCompositeOperation = palette.dark ? 'lighter' : 'source-over';
    const glow = glowSprite(palette.impulse);
    for (const impulse of frame.impulses) {
      const t = (now - impulse.start) / impulse.duration;
      if (t < 0 || t > 1) continue;
      const fadeInOut = Math.min(1, t * 6, (1 - t) * 6);
      for (let i = 0; i < 4; i++) {
        const tt = t - i * 0.025;
        if (tt < 0) continue;
        const p = curvePoint(pos(impulse.link.a), pos(impulse.link.b), CROSS_CURVATURE, tt);
        const r = (9 - i * 1.8) / k;
        ctx.globalAlpha = o * (fadeInOut * (1 - i * 0.22));
        ctx.drawImage(glow, p.x - r, p.y - r, r * 2, r * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // 7. Node being dragged: a ring in the accent color.
  if (frame.dragId) {
    const node =
      scene.cards.find((card) => card.id === frame.dragId) ??
      scene.hubs.find((hub) => hub.id === frame.dragId);
    if (node) {
      ctx.globalAlpha = o * 0.9;
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2.5 / k;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, Math.max(node.radius, minRadius) + 6 / k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  drawHighlights(ctx, scene, frame, view, o);
  ctx.restore();

  if (frame.labels !== 'none') drawLabels(ctx, scene, frame, view, m, dpr);
}

/** Selected link, focused node, hover ring and search pulses (on top of the scene). */
function drawHighlights(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  frame: FrameInput,
  view: View,
  o: number,
): void {
  const { k, now, palette } = frame;
  const minRadius = 1.3 / k;
  const find = (id: string) =>
    scene.cards.find((card) => card.id === id) ?? scene.hubs.find((hub) => hub.id === id);

  if (frame.selectedLinkId) {
    const link =
      [...scene.cross, ...scene.manual].find((l) => l.id === frame.selectedLinkId) ??
      scene.intra.flatMap((bucket) => bucket.links).find((l) => l.id === frame.selectedLinkId);
    if (link) {
      ctx.globalAlpha = o * 0.95;
      ctx.strokeStyle = palette.dark ? '#ffffff' : palette.accent;
      ctx.lineWidth = 3 / k;
      ctx.beginPath();
      if (link.cross) curve(ctx, link);
      else {
        ctx.moveTo(link.a.x ?? 0, link.a.y ?? 0);
        ctx.lineTo(link.b.x ?? 0, link.b.y ?? 0);
      }
      ctx.stroke();
    }
  }

  const emphasis = frame.emphasis;
  if (emphasis) {
    const node = find(emphasis.id);
    if (node && node.kind === 'card' && nodeVisible(node, view, node.radius * 6)) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const t = emphasis.t;
      const r = Math.max(node.radius, minRadius) * (1 + 0.7 * t);
      const color = palette.project[node.color];
      ctx.globalCompositeOperation = palette.dark ? 'lighter' : 'source-over';
      ctx.globalAlpha = o * t * (palette.dark ? 0.9 : 0.5);
      const glow = r * 5;
      ctx.drawImage(glowSprite(color), x - glow, y - glow, glow * 2, glow * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = o;
      ctx.drawImage(discSprite(color), x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = o * t;
      ctx.strokeStyle = palette.dark ? '#ffffff' : color;
      ctx.lineWidth = 2 / k;
      ctx.beginPath();
      ctx.arc(x, y, r + 5 / k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (frame.hoverId && frame.hoverId !== emphasis?.id) {
    const node = find(frame.hoverId);
    if (node) {
      ctx.globalAlpha = o * 0.8;
      ctx.strokeStyle = palette.dark ? '#ffffff' : palette.project[node.color];
      ctx.lineWidth = 1.5 / k;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, Math.max(node.radius, minRadius) + 4 / k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  for (const pulse of frame.pulses ?? []) {
    const t = (now - pulse.start) / PULSE_MS;
    if (t < 0 || t > 1) continue;
    for (const ring of [0, 0.35]) {
      const tt = t - ring;
      if (tt < 0 || tt > 0.65) continue;
      const p = tt / 0.65;
      ctx.globalAlpha = o * (1 - p) * 0.9;
      ctx.lineWidth = 2 / k;
      for (const id of pulse.ids) {
        const node = find(id);
        if (!node || !nodeVisible(node, view, 40 / k)) continue;
        ctx.strokeStyle = palette.project[node.color];
        ctx.beginPath();
        ctx.arc(
          node.x ?? 0,
          node.y ?? 0,
          Math.max(node.radius, minRadius) + (4 + p * 22) / k,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
  }
}

/** Labels in screen space: zoom independent and crisp. */
function drawLabels(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  frame: FrameInput,
  view: View,
  m: DOMMatrix,
  dpr: number,
): void {
  const { k, now, palette } = frame;
  const o = frame.opacity ?? 1;
  const toScreen = (node: BrainNode) => ({
    x: ((node.x ?? 0) * m.a + m.e) / dpr,
    y: ((node.y ?? 0) * m.d + m.f) / dpr,
  });

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const hubBoxes: LabelBox[] = [];
  for (const hub of scene.hubs) {
    if (!nodeVisible(hub, view, 200 / k)) continue;
    const p = toScreen(hub);
    const textWidth = measure(ctx, HUB_FONT, hub.label);
    const width = textWidth + 40;
    const box = {
      id: hub.id,
      x: p.x - width / 2,
      y: p.y + hub.radius * k + 10,
      width,
      height: HUB_LABEL_HEIGHT,
    };
    hubBoxes.push(box);
    ctx.globalAlpha = o * fade(hub, now);
    pill(ctx, box, palette);
    ctx.fillStyle = palette.project[hub.color];
    ctx.beginPath();
    ctx.arc(box.x + 15, box.y + box.height / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = HUB_FONT;
    ctx.fillStyle = palette.labelFg;
    ctx.fillText(hub.label, box.x + 26 + textWidth / 2, box.y + box.height / 2 + 0.5);
  }

  const candidates: LabelCandidate[] = [];
  const texts = new Map<string, string>();
  for (const card of scene.cards) {
    if (!nodeVisible(card, view, 0)) continue;
    const text = truncateLabel(card.label);
    texts.set(card.id, text);
    const p = toScreen(card);
    candidates.push({
      id: card.id,
      x: p.x,
      y: p.y,
      radius: Math.max(card.radius * k, 1.3),
      width: measure(ctx, LABEL_FONT, text) + 18,
      height: LABEL_HEIGHT,
      priority:
        card.degree + (card.id === frame.dragId || card.id === frame.emphasis?.id ? 1000 : 0),
    });
  }
  const boxes = placeLabels(candidates, {
    zoom: frame.labels === 'all' ? Math.max(k, LABEL_MIN_ZOOM) : k,
    reserved: hubBoxes,
  });
  if (boxes.length > 0) {
    const cardById = new Map(scene.cards.map((card) => [card.id, card]));
    ctx.font = LABEL_FONT;
    for (const box of boxes) {
      const card = cardById.get(box.id);
      ctx.globalAlpha = o * (card ? fade(card, now) * (card.level === 'new' ? 0.8 : 1) : 1);
      pill(ctx, box, palette);
      ctx.fillStyle = palette.labelFg;
      ctx.fillText(texts.get(box.id) ?? '', box.x + box.width / 2, box.y + box.height / 2 + 0.5);
    }
  }
  ctx.restore();
}

function pill(ctx: CanvasRenderingContext2D, box: LabelBox, palette: Palette): void {
  roundedRect(ctx, box.x, box.y, box.width, box.height);
  ctx.fillStyle = palette.labelBg;
  ctx.fill();
  ctx.strokeStyle = palette.labelBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
}
