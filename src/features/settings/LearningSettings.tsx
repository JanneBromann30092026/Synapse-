import { SegmentedControl, Select, Slider } from '@/components/ui';
import { useLiveData } from '@/data/live';
import { secretsRepo } from '@/data/repositories';
import { GRADING_MODES, GRADING_STRICTNESS, STUDY_DIRECTIONS } from '@/data/types';
import { de } from '@/i18n/de';
import { NEW_CARDS_PER_ROUND, TYPO_TOLERANCE, useSettings } from './settingsStore';

const t = de.settings.learning;

const strictnessOptions = GRADING_STRICTNESS.map((value) => ({
  value,
  label: t.strictnessOptions[value],
}));
const directionOptions = STUDY_DIRECTIONS.map((value) => ({
  value,
  label: t.directionOptions[value],
}));
const gradingOptions = GRADING_MODES.map((value) => ({
  value,
  label: t.gradingModeOptions[value],
}));

const decimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-base text-fg">{label}</span>
      {children}
    </div>
  );
}

/** Default values for new study rounds. */
export function LearningSettings() {
  const strictness = useSettings((s) => s.defaultStrictness);
  const direction = useSettings((s) => s.defaultDirection);
  const gradingMode = useSettings((s) => s.defaultGradingMode);
  const typoTolerance = useSettings((s) => s.typoTolerance);
  const newCardsPerRound = useSettings((s) => s.newCardsPerRound);
  const aiProvider = useSettings((s) => s.aiProvider);
  const set = useSettings((s) => s.set);
  const hasKey = useLiveData(() => secretsRepo.has('anthropicApiKey'));
  const aiUnavailable = aiProvider === 'off' || hasKey === false;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-fg-muted">{t.hint}</p>
      <div className="flex flex-col gap-2">
        <Row label={t.strictness}>
          <SegmentedControl
            label={t.strictness}
            options={strictnessOptions}
            value={strictness}
            onChange={(value) => void set('defaultStrictness', value)}
          />
        </Row>
        <p className="text-sm text-fg-muted">{t.strictnessHints[strictness]}</p>
      </div>
      <div className="h-px bg-line" />
      <Select
        label={t.direction}
        options={directionOptions}
        value={direction}
        onChange={(value) => void set('defaultDirection', value)}
      />
      <div className="h-px bg-line" />
      <div className="flex flex-col gap-2">
        <Row label={t.gradingMode}>
          <SegmentedControl
            label={t.gradingMode}
            options={gradingOptions}
            value={gradingMode}
            onChange={(value) => void set('defaultGradingMode', value)}
          />
        </Row>
        {gradingMode === 'ai' && aiUnavailable ? (
          <p className="text-sm text-fg-muted" data-testid="grading-no-ai">
            {t.gradingNoAi}
          </p>
        ) : (
          <p className="text-sm text-fg-muted">{t.gradingModeHints[gradingMode]}</p>
        )}
      </div>
      <div className="h-px bg-line" />
      <div className="flex flex-col gap-2">
        <Slider
          label={t.typoTolerance}
          value={typoTolerance}
          min={TYPO_TOLERANCE.min}
          max={TYPO_TOLERANCE.max}
          step={TYPO_TOLERANCE.step}
          format={(value) => decimal.format(value)}
          onChange={(value) => void set('typoTolerance', value)}
        />
        <p className="text-sm text-fg-muted">{t.typoHint}</p>
      </div>
      <div className="h-px bg-line" />
      <div className="flex flex-col gap-2">
        <Slider
          label={t.newCardsPerRound}
          value={newCardsPerRound}
          min={NEW_CARDS_PER_ROUND.min}
          max={NEW_CARDS_PER_ROUND.max}
          step={NEW_CARDS_PER_ROUND.step}
          onChange={(value) => void set('newCardsPerRound', value)}
        />
        <p className="text-sm text-fg-muted">{t.newCardsHint}</p>
      </div>
    </div>
  );
}
