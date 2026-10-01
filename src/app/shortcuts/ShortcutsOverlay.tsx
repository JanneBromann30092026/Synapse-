import { useEffect } from 'react';
import { Modal } from '@/components/ui';
import { isImeEvent } from '@/core/hotkeys';
import { de } from '@/i18n/de';
import { isTextField } from '../hooks/useHotkeys';
import { useShortcutsHelp } from './shortcutsStore';

const t = de.shortcuts;

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-8 items-center justify-center rounded-md border border-line-strong bg-surface-raised px-2 py-1 font-sans text-sm font-medium text-fg shadow-soft">
      {children}
    </kbd>
  );
}

/** Overview of all keyboard shortcuts; "?" opens it anywhere outside text fields. */
export function ShortcutsOverlay() {
  const open = useShortcutsHelp((s) => s.open);
  const setOpen = useShortcutsHelp((s) => s.setOpen);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isImeEvent(event) || isTextField(event.target)) return;
      event.preventDefault();
      setOpen(!useShortcutsHelp.getState().open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={t.title}
      description={t.description}
      size="lg"
    >
      <div className="grid gap-6 wide:grid-cols-2" data-testid="shortcuts">
        {t.groups.map((group) => (
          <section key={group.title} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-fg-muted uppercase">
              {group.title}
            </h3>
            <dl className="flex flex-col divide-y divide-line">
              {group.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-base text-fg-secondary">{item.label}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {item.keys.map((key) => (
                      <Key key={key}>{key}</Key>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
