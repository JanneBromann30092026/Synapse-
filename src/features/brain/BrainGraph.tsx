import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d';
import { summarizeFrames, FrameRecorder, type BrainDebug } from '@/core/brain/frames';
import {
  chargeStrength,
  fitTransform,
  freeze,
  graphBounds,
  linkDistance,
  linkStrength,
  nodeAt,
  seedLayout,
  type BrainLink,
  type BrainNode,
  type Viewport,
} from '@/core/brain/graph';
import { graphPositionsRepo } from '@/data/repositories';
import { de } from '@/i18n/de';
import type { GraphSnapshot } from './graphModel';
import { buildScene, drawFrame, readPalette, type Impulse } from './render';

const t = de.pages.brain.graph;

export interface BrainGraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  rearrange: () => void;
}

export interface BrainGraphProps {
  snapshot: GraphSnapshot;
  /** Store positions in graphPositions (off for synthetic data). */
  persist: boolean;
  /** Upper bound of the canvas resolution (device pixels per CSS pixel). */
  pixelRatio: number;
  reducedMotion: boolean;
  devMode: boolean;
  /** Space kept free for overlays when fitting. */
  padding: Viewport['padding'];
  handle: Ref<BrainGraphHandle>;
}

type Methods = ForceGraphMethods<NodeObject<BrainNode>, LinkObject<BrainNode, BrainLink>>;

const ZOOM_RANGE = { min: 0.08, max: 6 } as const;
/** Fitting never zooms in further than this (small graphs stay calm). */
const FIT_MAX_ZOOM = 2.5;
const LONG_PRESS_MS = 420;
/** Movement that turns a press into panning (touch) or a node drag (mouse). */
const TOUCH_SLOP = 10;
const MOUSE_SLOP = 3;
const DOUBLE_TAP_MS = 350;
const COOLDOWN_TICKS = 320;
const IMPULSE_EVERY_MS = 1500;
const IMPULSE_DURATION_MS = 1700;
const PARALLAX = 0.05;

/** Caps window.devicePixelRatio (force-graph reads it for the canvas size). */
function capPixelRatio(max: number): () => void {
  if (window.devicePixelRatio <= max) return () => undefined;
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => max });
  return () => {
    Reflect.deleteProperty(window, 'devicePixelRatio');
  };
}

function subscribeTheme(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const useTheme = () =>
  useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme ?? '');

/** The parts of d3-force's link and many-body forces used here. */
interface LinkForce {
  distance: (value: (link: BrainLink) => number) => LinkForce;
  strength: (value: (link: BrainLink) => number) => LinkForce;
}
interface ChargeForce {
  strength: (value: (node: BrainNode) => number) => ChargeForce;
  distanceMax: (value: number) => ChargeForce;
}

interface Press {
  pointerId: number;
  node: BrainNode;
  startX: number;
  startY: number;
  /** Node position minus pointer position (graph units), keeps the grab point. */
  dx: number;
  dy: number;
  mouse: boolean;
  /** performance.now() of the press. */
  startedAt: number;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

declare global {
  interface Window {
    __synapseBrain?: BrainDebug;
  }
}

/**
 * The brain canvas: react-force-graph-2d for zoom/pan (d3-zoom) and the simulation, own
 * drawing (render.ts) and own touch gestures: one finger pans, pinch zooms, double tap on
 * the background fits everything, long press + drag moves a node (mouse: drag directly).
 */
export default function BrainGraph({
  snapshot,
  persist,
  pixelRatio,
  reducedMotion,
  devMode,
  padding,
  handle,
}: BrainGraphProps) {
  const fgRef = useRef<Methods | undefined>(undefined);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const dotsRef = useRef<HTMLDivElement | null>(null);
  const statsRef = useRef<HTMLSpanElement | null>(null);
  const pressRef = useRef<Press | null>(null);
  const pointersRef = useRef(new Set<number>());
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const impulsesRef = useRef<Impulse[]>([]);
  const userMovedRef = useRef(false);
  const layoutPendingRef = useRef(false);
  const engineRunningRef = useRef(false);
  const fittedRef = useRef(false);
  const recorders = useRef({ draw: new FrameRecorder(), interval: new FrameRecorder(), last: 0 });

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [animating, setAnimating] = useState(false);
  const [rearranging, setRearranging] = useState(false);
  const [layoutRun, setLayoutRun] = useState(0);

  const theme = useTheme();
  const palette = useMemo(() => readPalette(theme === 'dark'), [theme]);
  const scene = useMemo(() => buildScene(snapshot), [snapshot]);

  const containerRef = useCallback(
    (element: HTMLDivElement | null) => {
      elementRef.current = element;
      if (!element) return;
      const restore = capPixelRatio(pixelRatio);
      const observer = new ResizeObserver(([entry]) => {
        if (!entry) return;
        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        setSize((old) => (old?.width === width && old.height === height ? old : { width, height }));
      });
      observer.observe(element);
      // While a node is dragged, d3-zoom must not see the finger moving (it would pan).
      const blockTouchMove = (event: TouchEvent) => {
        if (pressRef.current?.active) {
          event.stopPropagation();
          event.preventDefault();
        }
      };
      // Safari: no page zoom on pinch.
      const preventGesture = (event: Event) => event.preventDefault();
      element.addEventListener('touchmove', blockTouchMove, { capture: true, passive: false });
      element.addEventListener('gesturestart', preventGesture);
      return () => {
        observer.disconnect();
        element.removeEventListener('touchmove', blockTouchMove, { capture: true });
        element.removeEventListener('gesturestart', preventGesture);
        restore();
      };
    },
    [pixelRatio],
  );

  /** force-graph only redraws on its own events; a no-op zoom forces one frame. */
  const requestRedraw = useCallback(() => {
    const fg = fgRef.current;
    if (fg) fg.zoom(fg.zoom());
  }, []);

  const fit = useCallback(
    (durationMs: number) => {
      const fg = fgRef.current;
      const bounds = graphBounds(snapshot.nodes);
      if (!fg || !bounds || !size) return;
      const { k, center } = fitTransform(
        bounds,
        { width: size.width, height: size.height, padding },
        { min: ZOOM_RANGE.min, max: FIT_MAX_ZOOM },
      );
      const ms = reducedMotion ? 0 : durationMs;
      fg.centerAt(center.x, center.y, ms);
      fg.zoom(k, ms);
    },
    [snapshot, size, padding, reducedMotion],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const fg = fgRef.current;
      if (!fg) return;
      const k = Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, fg.zoom() * factor));
      fg.zoom(k, reducedMotion ? 0 : 320);
    },
    [reducedMotion],
  );

  useImperativeHandle(
    handle,
    () => ({
      zoomIn: () => zoomBy(1.5),
      zoomOut: () => zoomBy(1 / 1.5),
      fit: () => fit(650),
      rearrange: () => {
        seedLayout(snapshot, Math.random);
        layoutPendingRef.current = true;
        userMovedRef.current = false;
        setRearranging(true);
        setLayoutRun((run) => run + 1);
      },
    }),
    [zoomBy, fit, snapshot],
  );

  // Forces: clusters around the hubs, similar cards close, no centering (pinned nodes).
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !size) return;
    const link = fg.d3Force('link') as LinkForce | undefined;
    link?.distance(linkDistance).strength(linkStrength);
    const charge = fg.d3Force('charge') as ChargeForce | undefined;
    charge?.strength(chargeStrength).distanceMax(420);
    fg.d3Force('center', null);
  }, [size]);

  // A new snapshot with unplaced nodes runs the simulation; afterwards the layout is frozen.
  useEffect(() => {
    if (snapshot.free > 0) layoutPendingRef.current = true;
  }, [snapshot]);

  useEffect(() => {
    if (layoutRun > 0) fgRef.current?.d3ReheatSimulation();
  }, [layoutRun]);

  // First view: fit without animation as soon as the canvas exists.
  useEffect(() => {
    if (!size || fittedRef.current || !fgRef.current) return;
    fittedRef.current = true;
    fit(0);
  }, [size, fit]);

  useEffect(() => requestRedraw(), [palette, scene, requestRedraw]);

  const onEngineStop = useCallback(() => {
    engineRunningRef.current = false;
    if (!layoutPendingRef.current) return;
    layoutPendingRef.current = false;
    freeze(snapshot.nodes);
    setRearranging(false);
    if (persist) {
      void graphPositionsRepo.saveMany(
        snapshot.nodes.map((node) => ({ nodeId: node.id, x: node.x ?? 0, y: node.y ?? 0 })),
      );
    }
    if (!userMovedRef.current) fit(700);
  }, [snapshot, persist, fit]);

  // Impulses: now and then a light travels along a visible cross-project link.
  useEffect(() => {
    if (reducedMotion || scene.cross.length === 0) return;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    const interval = setInterval(() => {
      const fg = fgRef.current;
      const element = elementRef.current;
      if (!fg || !element || document.hidden) return;
      const now = performance.now();
      impulsesRef.current = impulsesRef.current.filter((i) => now - i.start < i.duration);
      if (impulsesRef.current.length >= 2 || Math.random() < 0.3) return;
      const a = fg.screen2GraphCoords(0, 0);
      const b = fg.screen2GraphCoords(element.clientWidth, element.clientHeight);
      const inside = (node: BrainNode) =>
        (node.x ?? 0) >= a.x &&
        (node.x ?? 0) <= b.x &&
        (node.y ?? 0) >= a.y &&
        (node.y ?? 0) <= b.y;
      let link: BrainLink | undefined;
      for (let attempt = 0; attempt < 24 && !link; attempt++) {
        const candidate = scene.cross[Math.floor(Math.random() * scene.cross.length)];
        if (candidate && (inside(candidate.a) || inside(candidate.b))) link = candidate;
      }
      if (!link) return;
      const flip = Math.random() < 0.5;
      impulsesRef.current.push({
        link: flip ? { ...link, a: link.b, b: link.a } : link,
        start: now,
        duration: IMPULSE_DURATION_MS,
      });
      setAnimating(true);
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = setTimeout(() => setAnimating(false), IMPULSE_DURATION_MS + 80);
    }, IMPULSE_EVERY_MS);
    return () => {
      clearInterval(interval);
      if (stopTimer) clearTimeout(stopTimer);
      impulsesRef.current = [];
      setAnimating(false);
    };
  }, [reducedMotion, scene]);

  // Developer mode: frame statistics (overlay + window.__synapseBrain for Playwright).
  useEffect(() => {
    if (!devMode) return;
    const { draw, interval } = recorders.current;
    window.__synapseBrain = {
      draw: () => summarizeFrames(draw.list()),
      interval: () => summarizeFrames(interval.list()),
      reset: () => {
        draw.clear();
        interval.clear();
      },
      engineRunning: () => engineRunningRef.current,
      nodes: snapshot.nodes.length,
      links: snapshot.links.length,
      nodeScreen: (id) => {
        const node = snapshot.nodes.find((n) => n.id === id);
        const fg = fgRef.current;
        if (!node || !fg || node.x === undefined || node.y === undefined) return null;
        return fg.graph2ScreenCoords(node.x, node.y);
      },
      zoom: () => fgRef.current?.zoom() ?? 0,
    };
    const timer = setInterval(() => {
      const stats = summarizeFrames(draw.list().slice(-60));
      if (statsRef.current) {
        statsRef.current.textContent = t.devFrame(stats.mean, stats.p95, snapshot.nodes.length);
      }
    }, 500);
    return () => {
      clearInterval(timer);
      delete window.__synapseBrain;
    };
  }, [devMode, snapshot]);

  const onRenderFramePost = useCallback(
    (ctx: CanvasRenderingContext2D, k: number) => {
      const start = performance.now();
      const press = pressRef.current;
      drawFrame(ctx, scene, {
        k,
        now: start,
        palette,
        impulses: impulsesRef.current,
        dragId: press?.active ? press.node.id : null,
      });
      const rec = recorders.current;
      rec.draw.push(performance.now() - start);
      if (rec.last > 0 && start - rec.last < 250) rec.interval.push(start - rec.last);
      rec.last = start;
    },
    [scene, palette],
  );

  // Gestures --------------------------------------------------------------------------

  const hitTest = (clientX: number, clientY: number, tolerancePx: number): BrainNode | null => {
    const fg = fgRef.current;
    const element = elementRef.current;
    if (!fg || !element) return null;
    const rect = element.getBoundingClientRect();
    const point = fg.screen2GraphCoords(clientX - rect.left, clientY - rect.top);
    return nodeAt(snapshot.nodes, point, tolerancePx / fg.zoom());
  };

  const graphPoint = (clientX: number, clientY: number) => {
    const fg = fgRef.current;
    const rect = elementRef.current?.getBoundingClientRect();
    if (!fg || !rect) return null;
    return fg.screen2GraphCoords(clientX - rect.left, clientY - rect.top);
  };

  const endPress = (save: boolean) => {
    const press = pressRef.current;
    if (!press) return;
    if (press.timer) clearTimeout(press.timer);
    pressRef.current = null;
    if (!press.active) return;
    requestRedraw();
    if (save && persist && press.node.x !== undefined && press.node.y !== undefined) {
      void graphPositionsRepo.saveMany([
        { nodeId: press.node.id, x: press.node.x, y: press.node.y },
      ]);
    }
  };

  const activate = (press: Press) => {
    press.active = true;
    press.timer = null;
    press.node.fx = press.node.x;
    press.node.fy = press.node.y;
    requestRedraw();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.add(event.pointerId);
    userMovedRef.current = true;
    if (pointersRef.current.size > 1) {
      // Second finger: pinch, never a node drag.
      endPress(true);
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const mouse = event.pointerType === 'mouse';
    const node = hitTest(event.clientX, event.clientY, mouse ? 4 : 14);
    const point = graphPoint(event.clientX, event.clientY);
    if (!node || !point) return;
    const press: Press = {
      pointerId: event.pointerId,
      node,
      startX: event.clientX,
      startY: event.clientY,
      dx: (node.x ?? 0) - point.x,
      dy: (node.y ?? 0) - point.y,
      mouse,
      startedAt: performance.now(),
      active: false,
      timer: null,
    };
    if (!mouse) press.timer = setTimeout(() => activate(press), LONG_PRESS_MS);
    pressRef.current = press;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    if (!press.active) {
      const moved = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
      // A busy main thread can delay the timer: a held press still counts as long press.
      const held = performance.now() - press.startedAt >= LONG_PRESS_MS;
      if (press.mouse ? moved > MOUSE_SLOP : held) activate(press);
      else if (moved > TOUCH_SLOP) endPress(false); // moving early = panning
      if (!press.active) return;
    }
    const point = graphPoint(event.clientX, event.clientY);
    if (!point) return;
    const x = point.x + press.dx;
    const y = point.y + press.dy;
    press.node.x = x;
    press.node.fx = x;
    press.node.y = y;
    press.node.fy = y;
    requestRedraw();
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pressRef.current?.pointerId === event.pointerId) endPress(true);
  };

  /** d3-zoom: a mouse press on a node drags the node instead of panning. */
  const panFilter = (event: MouseEvent) =>
    !(event.type === 'mousedown' && hitTest(event.clientX, event.clientY, 4));

  const onBackgroundClick = (event: MouseEvent) => {
    if (hitTest(event.clientX, event.clientY, 14)) return; // node taps belong to step 14
    const last = lastTapRef.current;
    if (
      last &&
      event.timeStamp - last.time < DOUBLE_TAP_MS &&
      Math.hypot(event.clientX - last.x, event.clientY - last.y) < 30
    ) {
      lastTapRef.current = null;
      fit(650);
      return;
    }
    lastTapRef.current = { time: event.timeStamp, x: event.clientX, y: event.clientY };
  };

  const onZoom = ({ k, x, y }: { k: number; x: number; y: number }) => {
    const dots = dotsRef.current;
    if (dots) dots.style.backgroundPosition = `${-x * k * PARALLAX}px ${-y * k * PARALLAX}px`;
  };

  return (
    <div className="absolute inset-0 overflow-hidden" data-testid="brain-graph">
      <div aria-hidden className="brain-backdrop absolute inset-0" />
      <div ref={dotsRef} aria-hidden className="brain-dots absolute inset-0" />
      <div
        ref={containerRef}
        role="img"
        aria-label={t.canvasLabel(
          scene.cards.length,
          scene.intra.reduce((sum, bucket) => sum + bucket.links.length, 0) + scene.cross.length,
        )}
        className="absolute inset-0 touch-none select-none"
        onPointerDownCapture={onPointerDown}
        onPointerMoveCapture={onPointerMove}
        onPointerUpCapture={onPointerEnd}
        onPointerCancelCapture={onPointerEnd}
      >
        {size && (
          <ForceGraph2D<BrainNode, BrainLink>
            ref={fgRef}
            width={size.width}
            height={size.height}
            graphData={snapshot}
            backgroundColor="rgba(0,0,0,0)"
            nodeVisibility={false}
            linkVisibility={false}
            enableNodeDrag={false}
            enablePointerInteraction={false}
            enablePanInteraction={panFilter}
            minZoom={ZOOM_RANGE.min}
            maxZoom={ZOOM_RANGE.max}
            autoPauseRedraw={!animating}
            warmupTicks={0}
            cooldownTicks={snapshot.free > 0 || rearranging ? COOLDOWN_TICKS : 0}
            d3AlphaDecay={snapshot.nodes.length > 1500 ? 0.045 : 0.026}
            d3VelocityDecay={0.38}
            onEngineTick={() => {
              engineRunningRef.current = true;
            }}
            onEngineStop={onEngineStop}
            onBackgroundClick={onBackgroundClick}
            onZoom={onZoom}
            onRenderFramePost={onRenderFramePost}
          />
        )}
      </div>
      {devMode && (
        <span
          ref={statsRef}
          data-testid="brain-frame-stats"
          className="pointer-events-none absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] rounded-full bg-surface/80 px-3 py-1 text-xs font-medium text-fg-secondary tabular-nums backdrop-blur"
        />
      )}
    </div>
  );
}
