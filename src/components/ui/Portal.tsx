import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Renders overlays at the end of <body>, above the app shell. */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
