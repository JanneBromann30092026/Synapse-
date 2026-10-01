import type { ReactNode } from 'react';

/** Button row at the bottom of a dialog body that stays visible while the body scrolls. */
export function DialogActions({ children, info }: { children: ReactNode; info?: ReactNode }) {
  return (
    <div className="sticky -bottom-2 z-10 -mx-6 mt-4 -mb-2 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-raised px-6 pt-4 pb-4">
      {info && <div className="mr-auto min-w-0 text-sm text-fg-muted">{info}</div>}
      {children}
    </div>
  );
}
