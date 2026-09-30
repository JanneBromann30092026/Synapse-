import { useReducedMotion as useSystemReducedMotion } from 'motion/react';
import { useSettings } from '@/features/settings/settingsStore';

/** True when the system setting or the app setting "Bewegungen reduzieren" asks for less motion. */
export function useReducedMotion(): boolean {
  const system = useSystemReducedMotion() ?? false;
  const app = useSettings((s) => s.reduceMotion);
  return system || app;
}
