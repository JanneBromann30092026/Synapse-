import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { Check, ShieldCheck } from 'lucide-react';
import { SegmentedControl, Surface, Toggle } from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { de } from '@/i18n/de';
import { BackupSettings } from '@/features/transfer/BackupSettings';
import { AiSettings } from './AiSettings';
import { BrainSettings } from './BrainSettings';
import { LearningSettings } from './LearningSettings';
import { THEME_PREFERENCES, useSettings } from './settingsStore';
import { AboutInfo, StorageInfo } from './SystemStatus';

const t = de.settings;

const themeOptions = THEME_PREFERENCES.map((value) => ({ value, label: t.themeOptions[value] }));

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h2 className="px-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">{title}</h2>
      <Surface>{children}</Surface>
    </section>
  );
}

/** Briefly shows "Gespeichert" after every change (keyframes restart via key, no timers). */
function SavedIndicator() {
  const savedAt = useSettings((s) => s.savedAt);
  if (savedAt === null) return null;
  return (
    <motion.span
      key={savedAt}
      role="status"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: [0, 1, 1, 0], y: [4, 0, 0, 0] }}
      transition={{ duration: 2.2, times: [0, 0.1, 0.75, 1] }}
      className="flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-sm font-medium text-success"
    >
      <Check size={15} aria-hidden />
      {t.saved}
    </motion.span>
  );
}

export function SettingsPage() {
  const theme = useSettings((s) => s.theme);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const devMode = useSettings((s) => s.devMode);
  const set = useSettings((s) => s.set);

  return (
    <Page title={t.title} width="narrow" actions={<SavedIndicator />}>
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

        <Section title={t.ai.title} testId="settings-ai">
          <AiSettings />
        </Section>

        <Section title={t.learning.title} testId="settings-learning">
          <LearningSettings />
        </Section>

        <Section title={t.brain.title} testId="settings-brain">
          <BrainSettings />
        </Section>

        <Section title={de.transfer.backups.title} testId="settings-backups">
          <BackupSettings />
        </Section>

        <Section title={t.storage.title}>
          <StorageInfo />
        </Section>

        <Section title={t.privacy.title}>
          <p className="flex gap-3 text-base text-fg-secondary">
            <ShieldCheck size={22} aria-hidden className="mt-0.5 shrink-0 text-success" />
            {t.privacy.text}
          </p>
        </Section>

        <Section title={t.about}>
          <AboutInfo />
        </Section>

        <Section title={t.developer}>
          <Toggle
            label={t.devMode}
            description={t.devModeHint}
            checked={devMode}
            onChange={(v) => void set('devMode', v)}
          />
        </Section>
      </div>
    </Page>
  );
}
