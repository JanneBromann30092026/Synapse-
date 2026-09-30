import { useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Scale } from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  SegmentedControl,
  Select,
  Surface,
  useImeGuard,
  type BadgeTone,
} from '@/components/ui';
import { canonicalForm, localGrade } from '@/core/grading';
import { useLiveData } from '@/data/live';
import { cardsRepo, projectsRepo } from '@/data/repositories';
import {
  CARD_DIRECTIONS,
  GRADING_STRICTNESS,
  type CardDirection,
  type GradingStrictness,
} from '@/data/types';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { gradingService, type GradingOutcome } from '@/services/grading';
import { spring } from '@/styles/motion';

const t = de.dev.grading;
const learning = de.settings.learning;

const directionOptions = CARD_DIRECTIONS.map((value) => ({
  value,
  label: learning.directionOptions[value],
}));
const strictnessOptions = GRADING_STRICTNESS.map((value) => ({
  value,
  label: learning.strictnessOptions[value],
}));

const percent = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const VERDICT_TONE: Record<GradingOutcome['verdict'], BadgeTone> = {
  correct: 'success',
  incorrect: 'danger',
  needs_self_assessment: 'warning',
};

interface Result {
  outcome: GradingOutcome;
  normalized: string;
  closest?: string;
  similarity?: number;
}

function shorten(text: string, max = 48): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-fg-secondary">{label}</dt>
      <dd className="text-right font-medium text-fg">{children}</dd>
    </div>
  );
}

function reasonText(outcome: GradingOutcome): string | undefined {
  if (outcome.verdict !== 'needs_self_assessment') return undefined;
  if (outcome.reason === 'ai_error' && outcome.errorCode) {
    return de.settings.aiErrors[outcome.errorCode];
  }
  return t.reasons[outcome.reason];
}

/** Developer tool: grade a typed answer against a card and show every detail. */
export function GradingPlayground() {
  const projects = useLiveData(() => projectsRepo.list());
  const [projectId, setProjectId] = useState<string>();
  const project = projects?.find((p) => p.id === projectId) ?? projects?.[0];
  const cards = useLiveData(
    async () => (project ? cardsRepo.listByProject(project.id) : []),
    [project?.id],
  );
  const [cardId, setCardId] = useState<string>();
  const card = cards?.find((c) => c.id === cardId) ?? cards?.[0];

  const defaultStrictness = useSettings((s) => s.defaultStrictness);
  const typoTolerance = useSettings((s) => s.typoTolerance);
  const [strictnessChoice, setStrictness] = useState<GradingStrictness>();
  const strictness = strictnessChoice ?? defaultStrictness;
  const [direction, setDirection] = useState<CardDirection>('front_to_back');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>();
  const [failed, setFailed] = useState(false);
  const ime = useImeGuard();

  const expected = card ? (direction === 'front_to_back' ? card.back : card.front) : '';

  async function grade(event: FormEvent) {
    event.preventDefault();
    if (!card || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const outcome = await gradingService.gradeAnswer({
        cardId: card.id,
        direction,
        userAnswer: answer,
        strictness,
      });
      const local = localGrade(answer, expected, { typoTolerance });
      setResult({
        outcome,
        normalized: canonicalForm(answer),
        ...(local.verdict === 'undecided' && local.closest
          ? { closest: local.closest, similarity: local.similarity }
          : {}),
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const outcome = result?.outcome;

  return (
    <section className="flex flex-col gap-3" data-testid="dev-section-grading">
      <h2 className="px-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">
        {t.title}
      </h2>
      <Surface className="flex flex-col gap-5">
        <p className="text-sm text-fg-muted">{t.hint}</p>
        {projects && projects.length > 0 && project ? (
          <>
            <div className="grid gap-4 wide:grid-cols-2">
              <Select
                label={t.project}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                value={project.id}
                onChange={(value) => {
                  setProjectId(value);
                  setCardId(undefined);
                }}
              />
              {cards && cards.length > 0 && card ? (
                <Select
                  label={t.card}
                  options={cards.map((c) => ({
                    value: c.id,
                    label: `${shorten(c.front, 24)} → ${shorten(c.back, 32)}`,
                  }))}
                  value={card.id}
                  onChange={setCardId}
                />
              ) : (
                <p className="self-end text-sm text-fg-muted">{t.noCards}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <SegmentedControl
                label={t.direction}
                options={directionOptions}
                value={direction}
                onChange={setDirection}
              />
              <SegmentedControl
                label={t.strictness}
                options={strictnessOptions}
                value={strictness}
                onChange={setStrictness}
              />
            </div>
            {card && (
              <form onSubmit={(event) => void grade(event)} className="flex flex-col gap-3">
                <p className="text-sm text-fg-secondary">
                  <span className="font-medium text-fg">
                    {direction === 'front_to_back' ? card.front : card.back}
                  </span>
                  {' · '}
                  {t.expected}: <span data-testid="grading-expected">{expected}</span>
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-60 flex-1">
                    <Input
                      label={t.answer}
                      placeholder={t.answerPlaceholder}
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && ime.isComposing(event)) event.preventDefault();
                      }}
                      {...ime.compositionProps}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="go"
                    />
                  </div>
                  <Button type="submit" icon={Scale} loading={busy}>
                    {t.submit}
                  </Button>
                </div>
              </form>
            )}
            {failed && <p className="text-sm text-danger">{t.failed}</p>}
            <AnimatePresence mode="wait" initial={false}>
              {result && outcome && (
                <motion.div
                  key={`${result.normalized}-${outcome.verdict}-${outcome.method}-${outcome.durationMs}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={spring.default}
                  className="flex flex-col gap-2 rounded-lg border border-line px-4 py-3"
                  data-testid="grading-result"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={VERDICT_TONE[outcome.verdict]}>
                      <span data-testid="grading-verdict">{t.verdicts[outcome.verdict]}</span>
                    </Badge>
                    <span className="text-sm text-fg-secondary" data-testid="grading-method">
                      {t.methods[outcome.method]}
                      {outcome.cached ? ` · ${t.fromCache}` : ''}
                    </span>
                  </div>
                  <dl className="divide-y divide-line text-sm">
                    {outcome.confidence !== undefined && (
                      <Detail label={t.confidence}>{percent.format(outcome.confidence)}</Detail>
                    )}
                    <Detail label={t.duration}>{`${outcome.durationMs} ms`}</Detail>
                    <Detail label={t.normalized}>
                      <span className="font-mono">{result.normalized || '–'}</span>
                    </Detail>
                    {result.closest !== undefined && result.similarity !== undefined && (
                      <Detail label={t.closest}>
                        {`${result.closest} (${decimal.format(result.similarity)})`}
                      </Detail>
                    )}
                    {reasonText(outcome) && <Detail label={t.reason}>{reasonText(outcome)}</Detail>}
                    {outcome.feedback && <Detail label={t.feedback}>{outcome.feedback}</Detail>}
                  </dl>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          projects && <p className="text-sm text-fg-muted">{t.noCards}</p>
        )}
      </Surface>
    </section>
  );
}
