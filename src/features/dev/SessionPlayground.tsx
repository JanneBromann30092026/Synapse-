import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Check, Play, RotateCcw, Send, Square, X } from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  ProgressBar,
  SegmentedControl,
  Select,
  Surface,
  useImeGuard,
  type BadgeTone,
} from '@/components/ui';
import type { SessionPhase } from '@/core/session';
import { useLiveData } from '@/data/live';
import { cardsRepo, projectsRepo } from '@/data/repositories';
import {
  GRADING_MODES,
  STUDY_DIRECTIONS,
  STUDY_MODES,
  type GradingMode,
  type StudyDirection,
} from '@/data/types';
import { useSettings } from '@/features/settings/settingsStore';
import { useStudySession } from '@/features/study/useStudySession';
import { de } from '@/i18n/de';

const t = de.dev.session;
const learning = de.settings.learning;
const grading = de.dev.grading;

const PHASE_TONE: Record<SessionPhase, BadgeTone> = {
  setup: 'neutral',
  presenting: 'accent',
  evaluating: 'accent',
  selfAssessing: 'warning',
  error: 'danger',
  revealed: 'accent',
  transitioning: 'neutral',
  roundComplete: 'success',
  aborted: 'neutral',
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-fg-secondary">{label}</dt>
      <dd className="text-right font-medium text-fg">{children}</dd>
    </div>
  );
}

function SessionRunner({ projectId }: { projectId: string }) {
  const session = useStudySession(projectId);
  const { state, stats, current } = session;
  const defaults = useSettings();
  const [gradingChoice, setGradingMode] = useState<GradingMode>();
  const [directionChoice, setDirection] = useState<StudyDirection>();
  const gradingMode = gradingChoice ?? defaults.defaultGradingMode;
  const direction = directionChoice ?? defaults.defaultDirection;
  const ime = useImeGuard();
  const { phase } = state;
  const { next } = session;

  // Without the card animation of step 9 the transition ends right away.
  useEffect(() => {
    if (phase === 'transitioning') next();
  }, [phase, next]);

  async function start() {
    const cards = await cardsRepo.listByProject(projectId);
    await session.start(
      cards.map(({ id, projectId: pid, front, back }) => ({ id, projectId: pid, front, back })),
      {
        projectId,
        mode: 'all',
        direction,
        gradingMode,
        strictness: defaults.defaultStrictness,
      },
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    session.submit();
  }

  const idle = phase === 'setup' || phase === 'aborted' || phase === 'roundComplete';
  const result = state.lastResult;

  return (
    <div className="flex flex-col gap-4">
      {idle && (
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <SegmentedControl
            label={t.gradingMode}
            options={GRADING_MODES.map((value) => ({
              value,
              label: learning.gradingModeOptions[value],
            }))}
            value={gradingMode}
            onChange={setGradingMode}
          />
          <SegmentedControl
            label={t.direction}
            options={STUDY_DIRECTIONS.map((value) => ({
              value,
              label: learning.directionOptions[value],
            }))}
            value={direction}
            onChange={setDirection}
          />
        </div>
      )}

      <dl className="divide-y divide-line text-sm" data-testid="session-state">
        <Row label={t.phase}>
          <Badge tone={PHASE_TONE[phase]}>
            <span data-testid="session-phase">{t.phases[phase]}</span>
          </Badge>
        </Row>
        {phase !== 'setup' && (
          <>
            <Row label={t.round}>
              <span data-testid="session-round">{state.roundNumber}</span>
            </Row>
            <Row label={t.progress}>
              <span data-testid="session-progress">{`${stats.answered} / ${stats.totalInRound}`}</span>
            </Row>
            <Row label={t.correctPercentage}>
              <span data-testid="session-percentage">{`${stats.correctPercentage} %`}</span>
            </Row>
            <Row label={t.result}>
              <span data-testid="session-piles">{t.piles(stats.correct, stats.incorrect)}</span>
            </Row>
          </>
        )}
      </dl>
      {phase !== 'setup' && <ProgressBar value={stats.progress} label={t.progress} />}

      {current && (
        <div className="flex flex-col gap-3 rounded-lg border border-line px-4 py-3">
          <p className="text-sm text-fg-secondary">
            {t.prompt}:{' '}
            <span className="text-base font-semibold text-fg" data-testid="session-prompt">
              {current.prompt}
            </span>
          </p>
          {phase !== 'presenting' && phase !== 'evaluating' && (
            <p className="text-sm text-fg-secondary">
              {t.expected}: <span data-testid="session-expected">{current.expected}</span>
            </p>
          )}
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="min-w-60 flex-1">
              <Input
                label={t.answer}
                value={state.userInput}
                disabled={phase !== 'presenting'}
                onChange={(event) => session.setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && ime.isComposing(event)) event.preventDefault();
                }}
                {...ime.compositionProps}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="send"
              />
            </div>
            {phase === 'presenting' && (
              <Button type="submit" icon={Send}>
                {t.submit}
              </Button>
            )}
            {phase === 'evaluating' && (
              <Button type="button" loading>
                {t.submit}
              </Button>
            )}
          </form>
          {phase === 'selfAssessing' && state.selfAssessmentReason && (
            <p className="text-sm text-fg-muted">
              {state.selfAssessmentReason === 'mode_self' ||
              state.selfAssessmentReason === 'evaluation_error'
                ? learning.gradingModeOptions.self
                : grading.reasons[state.selfAssessmentReason]}
            </p>
          )}
          {phase === 'error' && <p className="text-sm text-danger">{state.errorMessage}</p>}
          {result && phase === 'revealed' && (
            <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="session-result">
              <Badge tone={result.verdict === 'correct' ? 'success' : 'danger'}>
                <span data-testid="session-verdict">{grading.verdicts[result.verdict]}</span>
              </Badge>
              <span className="text-fg-secondary" data-testid="session-method">
                {grading.methods[result.method]}
              </span>
              <span className="text-fg-muted">{`${t.responseTime}: ${result.responseTimeMs} ms`}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(phase === 'selfAssessing' || phase === 'error') && (
              <>
                <Button
                  variant="success"
                  icon={Check}
                  onClick={() => session.selfAssess('correct')}
                >
                  {t.correct}
                </Button>
                <Button variant="danger" icon={X} onClick={() => session.selfAssess('incorrect')}>
                  {t.incorrect}
                </Button>
              </>
            )}
            {phase === 'error' && (
              <Button variant="secondary" icon={RotateCcw} onClick={session.retry}>
                {t.retry}
              </Button>
            )}
            {phase === 'revealed' && result && (
              <>
                <Button icon={ArrowRight} onClick={session.next}>
                  {t.next}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    session.override(result.verdict === 'correct' ? 'incorrect' : 'correct')
                  }
                >
                  {result.verdict === 'correct' ? t.overrideIncorrect : t.overrideCorrect}
                </Button>
              </>
            )}
            <Button variant="ghost" icon={Square} onClick={session.abort}>
              {t.abort}
            </Button>
          </div>
        </div>
      )}

      {idle && (
        <div className="flex flex-wrap gap-2">
          {phase === 'roundComplete' &&
            STUDY_MODES.map((mode) => (
              <Button
                key={mode}
                variant="secondary"
                icon={RotateCcw}
                disabled={
                  (mode === 'wrong' && stats.incorrect === 0) ||
                  (mode === 'right' && stats.correct === 0) ||
                  stats.totalInRound === 0
                }
                onClick={() => void session.startNextRound(mode)}
              >
                {t.again[mode]}
              </Button>
            ))}
          <Button
            icon={Play}
            onClick={() => {
              session.reset();
              void start();
            }}
          >
            {phase === 'setup' ? t.start : t.newRound}
          </Button>
        </div>
      )}
      <p className="text-xs text-fg-muted">{t.restoredHint}</p>
    </div>
  );
}

/** Developer tool: drive the study state machine without the study UI of step 9. */
export function SessionPlayground() {
  const projects = useLiveData(() => projectsRepo.list());
  const [projectId, setProjectId] = useState<string>();
  const project = projects?.find((p) => p.id === projectId) ?? projects?.[0];

  return (
    <section className="flex flex-col gap-3" data-testid="dev-section-session">
      <h2 className="px-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">
        {t.title}
      </h2>
      <Surface className="flex flex-col gap-5">
        <p className="text-sm text-fg-muted">{t.hint}</p>
        {projects && projects.length > 0 && project ? (
          <>
            <Select
              label={t.project}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              value={project.id}
              onChange={setProjectId}
            />
            <SessionRunner key={project.id} projectId={project.id} />
          </>
        ) : (
          projects && <p className="text-sm text-fg-muted">{grading.noCards}</p>
        )}
      </Surface>
    </section>
  );
}
