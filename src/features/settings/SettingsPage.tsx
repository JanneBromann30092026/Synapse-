import type { ReactNode } from 'react';
import { SegmentedControl, Surface, Toggle } from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { de } from '@/i18n/de';
import { THEME_PREFERENCES, useSettings } from './settingsStore';
import { SystemStatus } from './SystemStatus';

const t = de.settings;

const themeOptions = THEME_PREFERENCES.map((value) => ({ value, label: t.themeOptions[value] }));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">{title}</h2>
      <Surface>{children}</Surface>
    </section>
  );
}

export function SettingsPage() {
  const theme = useSettings((s) => s.theme);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const devMode = useSettings((s) => s.devMode);
  const set = useSettings((s) => s.set);

  return (
    <Page title={t.title} width="narrow">
      <div className="flex flex-col gap-8">
        <Section title={t.appearance}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-base text-fg">{t.theme}</span>
              <SegmentedControl
                label={t.theme}
                options={themeOptions}
                value={theme}
                onChange={(v) => void set('theme', v)}
              />
            </div>
            <div className="h-px bg-line" />
            <Toggle
              label={t.reduceMotion}
              description={t.reduceMotionHint}
              checked={reduceMotion}
              onChange={(v) => void set('reduceMotion', v)}
            />
          </div>
        </Section>

        <Section title={t.developer}>
          <Toggle
            label={t.devMode}
            description={t.devModeHint}
            checked={devMode}
            onChange={(v) => void set('devMode', v)}
          />
        </Section>

        <Section title={t.system}>
          <SystemStatus />
        </Section>
      </div>
    </Page>
  );
}
