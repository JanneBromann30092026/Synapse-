import type { ReactNode } from 'react';
import { Play } from 'lucide-react';
import { BottomSheet, Button, SegmentedControl } from '@/components/ui';
import { useOnline } from '@/app/hooks/useOnline';
import { useLiveData } from '@/data/live';
import { secretsRepo } from '@/data/repositories';
import {
  GRADING_MODES,
  GRADING_STRICTNESS,
  STUDY_DIRECTIONS,
  type GradingMode,
  type GradingStrictness,
  type StudyDirection,
} from '@/data/types';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';

const t = de.pages.study.setup;
const learning = de.settings.learning;

export interface StudyOptions {
  direction: StudyDirection;
  gradingMode: GradingMode;
  strictness: GradingStrictness;
}

export interface StudySetupSheetProps {
  open: boolean;
  cardCount: number;
  options: StudyOptions;
  onChange: (options: StudyOptions) => void;
  onStart: () => void;
  onClose: () => void;
  onBack: () => void;
}

/** Compact setup before a round: direction, grading and strictness (preset from the settings). */
export function StudySetupSheet({
  open,
  cardCount,
  options,
  onChange,
  onStart,
  onClose,
  onBack,
}: StudySetupSheetProps) {
  const aiProvider = useSettings((s) => s.aiProvider);
  const hasKey = useLiveData(() => secretsRepo.has('anthropicApiKey'));
  const online = useOnline();
  const aiHint =
    aiProvider === 'off'
      ? t.aiHints.off
      : hasKey === false
        ? t.aiHints.noKey
        : !online
          ? t.aiHints.offline
          : t.aiHints.ready;

  if (cardCount === 0) {
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        title={t.emptyTitle}
        description={t.emptyText}
        footer={
          <Button size="lg" fullWidth onClick={onBack}>
            {de.pages.study.back}
          </Button>
        }
      />
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t.title}
      description={t.cards(cardCount)}
      footer={
        <Button
          size="lg"
          icon={Play}
          fullWidth
          onClick={onStart}
          // Keeps the focus where onStart puts it (the answer field, so the keyboard opens).
          onMouseDown={(event) => event.preventDefault()}
          data-testid="study-start"
        >
          {t.start}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2" data-testid="study-setup">
        <Field label={t.direction}>
          <SegmentedControl
            label={t.direction}
            className="w-full"
            options={STUDY_DIRECTIONS.map((value) => ({
              value,
              label: t.directionOptions[value],
            }))}
            value={options.direction}
            onChange={(direction) => onChange({ ...options, direction })}
          />
        </Field>
        <Field
          label={t.gradingMode}
          hint={options.gradingMode === 'ai' ? aiHint : learning.gradingModeHints.self}
        >
          <SegmentedControl
            label={t.gradingMode}
            className="w-full"
            options={GRADING_MODES.map((value) => ({
              value,
              label: learning.gradingModeOptions[value],
            }))}
            value={options.gradingMode}
            onChange={(gradingMode) => onChange({ ...options, gradingMode })}
          />
        </Field>
        {options.gradingMode === 'ai' && (
          <Field label={t.strictness} hint={learning.strictnessHints[options.strictness]}>
            <SegmentedControl
              label={t.strictness}
              className="w-full"
              options={GRADING_STRICTNESS.map((value) => ({
                value,
                label: learning.strictnessOptions[value],
              }))}
              value={options.strictness}
              onChange={(strictness) => onChange({ ...options, strictness })}
            />
          </Field>
        )}
      </div>
    </BottomSheet>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-fg-secondary">{label}</span>
      {children}
      {hint && (
        <p className="text-sm text-fg-muted" data-testid="study-setup-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
