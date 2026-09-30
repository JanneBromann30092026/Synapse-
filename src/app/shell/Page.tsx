import type { ReactNode } from 'react';
import { cn } from '@/components/ui';

export interface PageProps {
  title: string;
  /** Page-specific actions on the right side of the header. */
  actions?: ReactNode;
  /** Small element left of the title (e.g. back button, project icon). */
  leading?: ReactNode;
  children: ReactNode;
  width?: 'default' | 'narrow';
}

const gutter = 'px-[max(1.5rem,env(safe-area-inset-left))] wide:px-8';

/** Page layout: header (title + actions, below the status bar) and a scrolling content area. */
export function Page({ title, actions, leading, children, width = 'default' }: PageProps) {
  const maxWidth = width === 'narrow' ? 'max-w-2xl' : 'max-w-5xl';
  return (
    <div className="flex h-full flex-col">
      <header className={cn('shrink-0 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3', gutter)}>
        <div className={cn('mx-auto flex min-h-11 w-full items-center gap-3', maxWidth)}>
          {leading}
          <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight text-fg wide:text-3xl">
            {title}
          </h1>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </header>
      <div data-scroll-container className={cn('scroll-area min-h-0 flex-1', gutter)}>
        <div className={cn('mx-auto w-full pt-2 pb-10', maxWidth)}>{children}</div>
      </div>
    </div>
  );
}
