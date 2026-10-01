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
import { focusCenter, linkAt, type Neighborhood } from '@/core/brain/interaction';
import {
  chargeStrength,
  curvePoint,
  fitTransform,
  freeze,
  graphBounds,
  linkDistance,
  linkStrength,
  nodeAt,
  seedLayout,
  type BrainGraph as BrainGraphData,
  type BrainLink,
  type BrainNode,
  type Point,
  type Viewport,
} from '@/core/brain/graph';
import { graphPositionsRepo } from '@/data/repositories';
import { de } from '@/i18n/de';
import type { GraphSnapshot } from './graphModel';
import {
  buildScene,
  CROSS_CURVATURE,
  drawFrame,
  LINK_GROW_MS,
  PULSE_MS,
  readPalette,
  type FrameInput,
  type Impulse,
  type Pulse,
  type Scene,
} from './render';

const t = de.pages.brain.graph;

export interface BrainGraphHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  rearrange: () => void;
  /** Flies to a node so that it and its related nodes (neighbors) fit next to the panel. */
  focusNode: (id: string, related?: readonly string[]) => void;
  /** Flies to the cluster of a project. */
  focusCluster: (projectId: string) => void;
  /** Lets nodes pulse briefly (search hits). */
  pulse: (ids: readonly string[]) => void;
  /** Screen position (relative to the view) of a node. */
  nodeScreen: (id: string) => Point | null;
}

/** Focus mode: the selected node and its neighborhood stay bright. */
export interface BrainFocus extends Neighborhood {
  id: string;
  kind: 'card' | 'hub' | 'link';
}

export interface BrainGraphProps {
  snapshot: GraphSnapshot;
  /** The filtered part of the snapshot that is drawn and can be tapped. */
  visible: BrainGraphData;
  focus: BrainFocus | null;
  selectedLinkId: string | null;
  /** Free space when flying to a node (padding plus the open panel). */
  focusPadding: Viewport['padding'];
  onSelectNode: (node: BrainNode) => void;
  onSelectLink: (link: BrainLink, at: Point) => void;
  /** Single tap on empty space. */
  onBackgroundTap: () => void;
  /** Mouse/trackpad hover over a card (null when the pointer leaves it). */
  onHover: (node: BrainNode | null) => void;
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
/** Zoom used when flying to a single node. */
const FOCUS_ZOOM = 2.4;
const CAMERA_MS = 650;
/** How dark the rest of the graph gets in focus mode (0..1). */
const DIM_DEPTH = 0.85;
const DIM_MS = 380;
const FILTER_FADE_MS = 320;
const LINK_TOLERANCE_PX = 12;

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

interface Fade {
  from: number;
  to: number;
  start: number;
}

function fadeValue(fade: Fade, now: number, duration: number): number {
  return fade.from + (fade.to - fade.from) * easeOut((now - fade.start) / duration);
}

function subgraph(graph: BrainGraphData, focus: Neighborhood): BrainGraphData {
  return {
    nodes: graph.nodes.filter((node) => focus.nodeIds.has(node.id)),
    links: graph.links.filter((link) => focus.linkIds.has(link.id)),
  };
}

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
  visible,
  focus,
  selectedLinkId,
  focusPadding,
  onSelectNode,
  onSelectLink,
  onBackgroundTap,
  onHover,
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
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(0);
  const hoverRef = useRef<{ id: string | null; frame: number }>({ id: null, frame: 0 });
  const animUntilRef = useRef(0);
  const animLoopRef = useRef(0);
  const cameraUntilRef = useRef(0);
  const dimRef = useRef<Fade>({ from: 0, to: 0, start: 0 });
  const overlayRef = useRef<{ scene: Scene; focus: BrainFocus; start: number } | null>(null);
  const transitionRef = useRef<{ from: Scene; start: number } | null>(null);
  const lastSceneRef = useRef<Scene | null>(null);
  const pulsesRef = useRef<Pulse[]>([]);
  const linkBornRef = useRef(new Map<string, number>());
  const knownManualRef = useRef<Set<string> | null>(null);

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [animating, setAnimating] = useState(false);
  const [rearranging, setRearranging] = useState(false);
  const [layoutRun, setLayoutRun] = useState(0);

  const theme = useTheme();
  const palette = useMemo(() => readPalette(theme === 'dark'), [theme]);
  const scene = useMemo(() => buildScene(visible), [visible]);
  const focusScene = useMemo(
    () => (focus ? buildScene(subgraph(visible, focus)) : null),
    [visible, focus],
  );

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
    // A no-op zoom would interrupt a running camera flight (which redraws anyway).
    if (fg && performance.now() >= cameraUntilRef.current) fg.zoom(fg.zoom());
  }, []);

  /** Redraws every frame for a while (focus fades, pulses, growing links). */
  const animateFor = useCallback(
    (ms: number) => {
      animUntilRef.current = Math.max(animUntilRef.current, performance.now() + ms);
      if (animLoopRef.current) return;
      const tick = () => {
        requestRedraw();
        animLoopRef.current =
          performance.now() < animUntilRef.current ? requestAnimationFrame(tick) : 0;
      };
      animLoopRef.current = requestAnimationFrame(tick);
    },
    [requestRedraw],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(animLoopRef.current);
      animLoopRef.current = 0;
    },
    [],
  );

  const moveCamera = useCallback(
    (center: Point, k: number, durationMs: number) => {
      const fg = fgRef.current;
      if (!fg) return;
      const ms = reducedMotion ? 0 : durationMs;
      cameraUntilRef.current = performance.now() + ms + 30;
      fg.centerAt(center.x, center.y, ms);
      fg.zoom(k, ms);
      animateFor(ms + 60);
    },
    [reducedMotion, animateFor],
  );

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
      moveCamera(center, k, durationMs);
    },
    [snapshot, size, padding, moveCamera],
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
      focusNode: (id, related = []) => {
        const fg = fgRef.current;
        const node = snapshot.nodes.find((n) => n.id === id);
        if (!fg || !node || node.x === undefined || node.y === undefined) return;
        const wanted = new Set(related);
        const bounds = graphBounds(snapshot.nodes.filter((n) => wanted.has(n.id) || n === node));
        if (wanted.size > 0 && bounds && size) {
          const pad = 40;
          const fitted = fitTransform(
            { x0: bounds.x0 - pad, y0: bounds.y0 - pad, x1: bounds.x1 + pad, y1: bounds.y1 + pad },
            { width: size.width, height: size.height, padding: focusPadding },
            { min: ZOOM_RANGE.min, max: FOCUS_ZOOM },
          );
          moveCamera(fitted.center, fitted.k, CAMERA_MS);
          return;
        }
        const k = Math.min(ZOOM_RANGE.max, Math.max(fg.zoom(), FOCUS_ZOOM));
        moveCamera(focusCenter({ x: node.x, y: node.y }, focusPadding, k), k, CAMERA_MS);
      },
      focusCluster: (projectId) => {
        const bounds = graphBounds(visible.nodes.filter((n) => n.projectId === projectId));
        if (!bounds || !size) return;
        const { k, center } = fitTransform(
          bounds,
          { width: size.width, height: size.height, padding: focusPadding },
          { min: ZOOM_RANGE.min, max: FIT_MAX_ZOOM },
        );
        moveCamera(center, k, CAMERA_MS);
      },
      pulse: (ids) => {
        if (ids.length === 0 || reducedMotion) return;
        const now = performance.now();
        pulsesRef.current = [
          ...pulsesRef.current.filter((p) => now - p.start < PULSE_MS),
          { ids: new Set(ids), start: now },
        ];
        animateFor(PULSE_MS);
      },
      nodeScreen: (id) => {
        const node = snapshot.nodes.find((n) => n.id === id);
        const fg = fgRef.current;
        if (!node || !fg || node.x === undefined || node.y === undefined) return null;
        return fg.graph2ScreenCoords(node.x, node.y);
      },
    }),
    [zoomBy, fit, snapshot, visible, size, focusPadding, moveCamera, animateFor, reducedMotion],
  );

  // Focus mode: dim the rest, fade the neighborhood in (and out again when it closes).
  useEffect(() => {
    const now = performance.now();
    const dim = fadeValue(dimRef.current, now, DIM_MS);
    if (focus && focusScene) {
      const same = overlayRef.current?.focus.id === focus.id;
      overlayRef.current = {
        scene: focusScene,
        focus,
        start: same ? (overlayRef.current?.start ?? now) : now,
      };
      dimRef.current = { from: dim, to: 1, start: now };
    } else {
      dimRef.current = { from: dim, to: 0, start: now };
    }
    animateFor(reducedMotion ? 0 : Math.max(DIM_MS, 320) + 40);
    if (reducedMotion) dimRef.current = { ...dimRef.current, from: dimRef.current.to };
  }, [focus, focusScene, animateFor, reducedMotion]);

  // Filter changes cross-fade between the old and the new scene.
  useEffect(() => {
    const previous = lastSceneRef.current;
    lastSceneRef.current = scene;
    if (!previous || previous === scene || reducedMotion) return;
    transitionRef.current = { from: previous, start: performance.now() };
    animateFor(FILTER_FADE_MS + 40);
  }, [scene, animateFor, reducedMotion]);

  // New manual links grow from one card to the other.
  useEffect(() => {
    const manual = snapshot.links.filter((link) => link.kind === 'manual');
    const known = knownManualRef.current;
    knownManualRef.current = new Set(manual.map((link) => link.id));
    if (!known || reducedMotion) return;
    const now = performance.now();
    let grown = false;
    for (const link of manual) {
      if (known.has(link.id)) continue;
      linkBornRef.current.set(link.id, now);
      grown = true;
    }
    if (grown) animateFor(LINK_GROW_MS + 40);
  }, [snapshot, animateFor, reducedMotion]);

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
      linkScreen: (id) => {
        const link = visible.links.find((l) => l.id === id);
        const fg = fgRef.current;
        if (!link || !fg) return null;
        const a = { x: link.a.x ?? 0, y: link.a.y ?? 0 };
        const b = { x: link.b.x ?? 0, y: link.b.y ?? 0 };
        const mid = link.cross
          ? curvePoint(a, b, CROSS_CURVATURE, 0.5)
          : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return fg.graph2ScreenCoords(mid.x, mid.y);
      },
      cardLinks: () =>
        visible.links
          .filter((l) => l.kind !== 'hub')
          .map((l) => ({ id: l.id, kind: l.kind, cross: l.cross, a: l.a.id, b: l.b.id })),
      cameraMoving: () => performance.now() < cameraUntilRef.current,
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
  }, [devMode, snapshot, visible]);

  const onRenderFramePost = useCallback(
    (ctx: CanvasRenderingContext2D, k: number) => {
      const start = performance.now();
      const press = pressRef.current;
      pulsesRef.current = pulsesRef.current.filter((p) => start - p.start < PULSE_MS);
      for (const [id, born] of linkBornRef.current) {
        if (start - born > LINK_GROW_MS) linkBornRef.current.delete(id);
      }
      const dim = fadeValue(dimRef.current, start, DIM_MS);
      const base = 1 - DIM_DEPTH * dim;
      const common: FrameInput = {
        k,
        now: start,
        palette,
        impulses: dim > 0.01 ? [] : impulsesRef.current,
        dragId: press?.active ? press.node.id : null,
        hoverId: hoverRef.current.id,
        selectedLinkId,
        pulses: pulsesRef.current,
        linkBorn: linkBornRef.current,
      };

      let fadeIn = 1;
      const transition = transitionRef.current;
      if (transition) {
        fadeIn = easeOut((start - transition.start) / FILTER_FADE_MS);
        if (fadeIn >= 1) transitionRef.current = null;
        else
          drawFrame(ctx, transition.from, {
            ...common,
            opacity: base * (1 - fadeIn),
            labels: 'none',
          });
      }
      drawFrame(ctx, scene, {
        ...common,
        opacity: base * fadeIn,
        labels: dim > 0.5 ? 'none' : 'auto',
      });

      const overlay = overlayRef.current;
      if (overlay && dim > 0.001) {
        const t = Math.min(dim, easeOut((start - overlay.start) / DIM_MS));
        drawFrame(ctx, overlay.scene, {
          ...common,
          opacity: t,
          labels: 'all',
          emphasis: overlay.focus.kind === 'card' ? { id: overlay.focus.id, t } : null,
        });
      } else if (overlay && dimRef.current.to === 0) {
        overlayRef.current = null;
      }

      const rec = recorders.current;
      rec.draw.push(performance.now() - start);
      if (rec.last > 0 && start - rec.last < 250) rec.interval.push(start - rec.last);
      rec.last = start;
    },
    [scene, palette, selectedLinkId],
  );

  useEffect(() => requestRedraw(), [selectedLinkId, requestRedraw]);

  // Gestures --------------------------------------------------------------------------

  const hitTest = (clientX: number, clientY: number, tolerancePx: number): BrainNode | null => {
    const fg = fgRef.current;
    const element = elementRef.current;
    if (!fg || !element) return null;
    const rect = element.getBoundingClientRect();
    const point = fg.screen2GraphCoords(clientX - rect.left, clientY - rect.top);
    return nodeAt(visible.nodes, point, tolerancePx / fg.zoom());
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
    suppressClickRef.current = performance.now() + 400;
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
    downRef.current = { x: event.clientX, y: event.clientY };
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

  const updateHover = (clientX: number, clientY: number) => {
    const hover = hoverRef.current;
    if (hover.frame) return;
    hover.frame = requestAnimationFrame(() => {
      hover.frame = 0;
      const node = hitTest(clientX, clientY, 5);
      const id = node?.kind === 'card' ? node.id : null;
      if (id === hover.id) return;
      hover.id = id;
      onHover(id ? node : null);
      requestRedraw();
    });
  };

  const clearHover = () => {
    const hover = hoverRef.current;
    if (hover.frame) cancelAnimationFrame(hover.frame);
    hover.frame = 0;
    if (hover.id === null) return;
    hover.id = null;
    onHover(null);
    requestRedraw();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (event.pointerType === 'mouse' && !press && event.buttons === 0) {
      updateHover(event.clientX, event.clientY);
      return;
    }
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
    const down = downRef.current;
    if (
      performance.now() < suppressClickRef.current ||
      (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > TOUCH_SLOP)
    ) {
      return;
    }
    const node = hitTest(event.clientX, event.clientY, 14);
    if (node) {
      lastTapRef.current = null;
      onSelectNode(node);
      return;
    }
    const fg = fgRef.current;
    const rect = elementRef.current?.getBoundingClientRect();
    const point = graphPoint(event.clientX, event.clientY);
    if (fg && rect && point) {
      const link = linkAt(visible.links, point, LINK_TOLERANCE_PX / fg.zoom(), CROSS_CURVATURE);
      if (link) {
        lastTapRef.current = null;
        onSelectLink(link, { x: event.clientX - rect.left, y: event.clientY - rect.top });
        return;
      }
    }
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
    onBackgroundTap();
  };

  const onZoom = ({ k, x, y }: { k: number; x: number; y: number }) => {
    if (hoverRef.current.id && performance.now() >= cameraUntilRef.current) clearHover();
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
        onPointerLeave={clearHover}
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
          className="pointer-events-none absolute right-[max(1rem,env(safe-area-inset-right))] bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] rounded-full bg-surface/80 px-3 py-1 text-xs font-medium text-fg-secondary tabular-nums backdrop-blur"
        />
      )}
    </div>
  );
}
