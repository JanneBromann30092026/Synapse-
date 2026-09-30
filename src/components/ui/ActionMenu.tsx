import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { cn } from './cn';
import { useEscape } from './hooks/useEscape';
import { useFocusTrap } from './hooks/useFocusTrap';
import { IconButton } from './IconButton';
import { Portal } from './Portal';

export interface ActionMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** A point (long press) or an element rect (the "⋯" button). */
export type MenuAnchor = { x: number; y: number } | DOMRect;

export interface ActionMenuProps {
  open: boolean;
  onClose: () => void;
  anchor: MenuAnchor | null;
  items: ActionMenuItem[];
  label?: string;
}

const MARGIN = 8;

export function ActionMenu({ open, onClose, ...rest }: ActionMenuProps) {
  return (
    <Portal>
      <AnimatePresence>
        {open && rest.anchor && (
          <MenuPanel key="menu" onClose={onClose} {...rest} anchor={rest.anchor} />
        )}
      </AnimatePresence>
    </Portal>
  );
}

function MenuPanel({
  onClose,
  anchor,
  items,
  label = de.ui.moreActions,
}: Omit<ActionMenuProps, 'open' | 'anchor'> & { anchor: MenuAnchor }) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useFocusTrap(menu, true);
  useEscape(onClose, true);

  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const isRect = anchor instanceof DOMRect;
    // Left-aligned with the trigger; right-aligned when it would overflow the viewport.
    let left = isRect ? anchor.left : anchor.x;
    if (isRect && left + width > window.innerWidth - MARGIN) left = anchor.right - width;
    let top = isRect ? anchor.bottom + MARGIN : anchor.y;
    if (top + height > window.innerHeight - MARGIN) {
      top = (isRect ? anchor.top - MARGIN : anchor.y) - height;
    }
    left = Math.min(Math.max(MARGIN, left), window.innerWidth - width - MARGIN);
    top = Math.min(Math.max(MARGIN, top), window.innerHeight - height - MARGIN);
    setPosition({ left, top });
  }, [anchor]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    buttons[(next + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <motion.div
        ref={menu}
        role="menu"
        aria-label={label}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: position ? 1 : 0, scale: position ? 1 : 0.92 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={spring.snappy}
        style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
        className="absolute flex min-w-56 origin-top-left flex-col rounded-lg border border-line bg-surface-raised p-1.5 shadow-float"
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
              className={cn(
                'focus-ring no-callout flex min-h-11 items-center gap-3 rounded-md px-3 text-left text-base transition-colors disabled:opacity-40',
                item.danger ? 'text-danger hover:bg-danger-soft' : 'text-fg hover:bg-accent-soft',
              )}
            >
              {Icon && <Icon size={18} aria-hidden />}
              {item.label}
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}

/** "⋯" button that opens an ActionMenu below itself. */
export function ActionMenuButton({
  items,
  label = de.ui.moreActions,
}: {
  items: ActionMenuItem[];
  label?: string;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <IconButton
        icon={MoreHorizontal}
        label={label}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}
      />
      <ActionMenu
        open={anchor !== null}
        anchor={anchor}
        onClose={() => setAnchor(null)}
        items={items}
        label={label}
      />
    </>
  );
}
