import type { Transition } from 'motion/react';

/** Spring presets (stiffness/damping). Short and bouncy, never chaotic. */
export const spring = {
  default: { type: 'spring', stiffness: 300, damping: 30 },
  soft: { type: 'spring', stiffness: 170, damping: 26 },
  snappy: { type: 'spring', stiffness: 500, damping: 35 },
} as const satisfies Record<string, Transition>;

/** Durations in seconds (motion) – 150/250/400 ms. */
export const duration = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
} as const;

export const easeOut = [0.22, 1, 0.36, 1] as const;

export const fade = { duration: duration.base, ease: easeOut } as const satisfies Transition;

/** Scale used for pressed buttons and tappable surfaces. */
export const TAP_SCALE = 0.97;
