import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  FolderPlus,
  KeyRound,
  Layers,
  PenLine,
  Share,
  Sparkles,
  SquarePlus,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button, cn, Input, toast } from '@/components/ui';
import { Portal } from '@/components/ui/Portal';
import { useFocusTrap } from '@/components/ui/hooks/useFocusTrap';
import { useAppStatus } from '@/app/useAppStatus';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { saveApiKey } from '@/services/ai/apiKey';
import { easeOut, spring } from '@/styles/motion';
import { useReducedMotion } from '@/styles/useReducedMotion';
import { writeOnboardingFlag } from './onboardingFlag';

const t = de.onboarding;

type StepId = 'welcome' | 'install' | 'ai' | 'start';

const FEATURE_ICONS = [Layers, PenLine, Brain] as const;
const INSTALL_ICONS = [Share, SquarePlus, Check] as const;

function finish(): void {
  writeOnboardingFlag();
  void useSettings.getState().set('onboardingDone', true);
}

function StepHeader({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {icon}
      <h2 id="onboarding-title" className="text-2xl font-semibold tracking-tight text-fg">
        {title}
      </h2>
      <p className="max-w-md text-base text-fg-secondary">{text}</p>
    </div>
  );
}

function RoundIcon({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
      {children}
    </div>
  );
}

function WelcomeStep() {
  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        icon={
          <img
            src={`${import.meta.env.BASE_URL}icons/favicon.svg`}
            alt=""
            className="size-20 rounded-[22px] shadow-[0_16px_40px_-12px_var(--accent-glow)]"
          />
        }
        title={t.welcome.title}
        text={t.welcome.text}
      />
      <ul className="flex flex-col gap-2">
        {t.welcome.features.map((feature, index) => {
          const Icon = FEATURE_ICONS[index] ?? Sparkles;
          return (
            <motion.li
              key={feature.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.soft, delay: 0.1 + index * 0.06 }}
              className="flex items-start gap-3 rounded-lg bg-surface-raised px-4 py-3"
            >
              <Icon size={22} aria-hidden className="mt-0.5 shrink-0 text-accent" />
              <div>
                <p className="font-medium text-fg">{feature.title}</p>
                <p className="text-sm text-fg-secondary">{feature.text}</p>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function InstallStep() {
  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        icon={
          <RoundIcon>
            <SquarePlus size={30} aria-hidden />
          </RoundIcon>
        }
        title={t.install.title}
        text={t.install.text}
      />
      <ol className="flex flex-col gap-2">
        {t.install.steps.map((step, index) => {
          const Icon = INSTALL_ICONS[index] ?? Check;
          return (
            <li
              key={step}
              className="flex items-center gap-3 rounded-lg bg-surface-raised px-4 py-3 text-base text-fg"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                {index + 1}
              </span>
              <span className="flex-1">{step}</span>
              <Icon size={20} aria-hidden className="shrink-0 text-fg-muted" />
            </li>
          );
        })}
      </ol>
      <p className="text-center text-sm text-fg-muted">{t.install.later}</p>
    </div>
  );
}

function AiStep() {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const result = await saveApiKey(draft);
    setSaving(false);
    if (result !== 'ok') {
      setError(de.settings.ai.keyErrors[result]);
      return;
    }
    await useSettings.getState().set('aiProvider', 'anthropic');
    setDraft('');
    setError(null);
    setSaved(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        icon={
          <RoundIcon>
            <KeyRound size={28} aria-hidden />
          </RoundIcon>
        }
        title={t.ai.title}
        text={t.ai.text}
      />
      {saved ? (
        <p
          role="status"
          className="flex items-center justify-center gap-2 rounded-lg bg-success-soft px-4 py-3 text-base font-medium text-success"
        >
          <Check size={20} aria-hidden />
          {t.ai.saved}
        </p>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
          <Input
            label={t.ai.keyLabel}
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={de.settings.ai.keyPlaceholder}
            value={draft}
            error={error ?? undefined}
            hint={de.settings.ai.keyHint}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            data-testid="onboarding-key"
          />
          <Button type="submit" variant="secondary" loading={saving} disabled={!draft.trim()}>
            {t.ai.save}
          </Button>
        </form>
      )}
      {!saved && <p className="text-center text-sm text-fg-muted">{t.ai.skipHint}</p>}
    </div>
  );
}

function ChoiceButton({
  icon,
  title,
  hint,
  onClick,
  busy,
  testId,
  primary,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  busy?: boolean;
  testId: string;
  primary?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      transition={spring.snappy}
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      data-testid={testId}
      className={cn(
        'focus-ring flex min-h-20 w-full items-center gap-4 rounded-xl border px-5 py-4 text-left transition-colors disabled:opacity-60',
        primary
          ? 'border-transparent bg-accent text-on-accent shadow-[0_12px_32px_-12px_var(--accent-glow)]'
          : 'border-line bg-surface-raised text-fg hover:border-line-strong',
      )}
    >
      <span
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-full',
          primary ? 'bg-white/15' : 'bg-accent-soft text-accent',
        )}
      >
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-lg font-semibold">{title}</span>
        <span className={cn('text-sm', primary ? 'text-on-accent/80' : 'text-fg-secondary')}>
          {hint}
        </span>
      </span>
    </motion.button>
  );
}

function StartStep({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  const loadDemo = async () => {
    setBusy(true);
    try {
      const { loadDemoData } = await import('@/features/dev/demoData');
      const result = await loadDemoData();
      toast.success(t.start.demoLoaded(result.projects, result.cards));
    } catch (error: unknown) {
      console.error('Demo data failed', error);
      toast.error(t.start.demoFailed);
    }
    onDone();
  };

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        icon={
          <RoundIcon>
            <Sparkles size={28} aria-hidden />
          </RoundIcon>
        }
        title={t.start.title}
        text={t.start.text}
      />
      <div className="flex flex-col gap-3">
        <ChoiceButton
          primary
          icon={<Sparkles size={24} aria-hidden />}
          title={t.start.demo}
          hint={t.start.demoHint}
          busy={busy}
          onClick={() => void loadDemo()}
          testId="onboarding-demo"
        />
        <ChoiceButton
          icon={<FolderPlus size={24} aria-hidden />}
          title={t.start.empty}
          hint={t.start.emptyHint}
          busy={busy}
          onClick={onDone}
          testId="onboarding-empty"
        />
      </div>
    </div>
  );
}

/** First-start welcome (2–4 steps): features, install hint, optional API key, demo or empty. */
export default function Onboarding() {
  const standalone = useAppStatus((s) => s.standalone);
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const steps: StepId[] = ['welcome', ...(standalone ? [] : ['install' as const]), 'ai', 'start'];
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  const step = steps[Math.min(index, steps.length - 1)] ?? 'welcome';
  const last = index >= steps.length - 1;

  const go = (next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex(Math.max(0, Math.min(steps.length - 1, next)));
  };

  const done = () => {
    finish();
    void navigate('/projects');
  };

  const offset = reduced ? 0 : 48;

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-bg/80 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.3 } }}
        exit={{ opacity: 0, transition: { duration: 0.25 } }}
      >
        <div aria-hidden className="onboarding-glow pointer-events-none absolute inset-0" />
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          aria-label={t.label}
          data-testid="onboarding"
          tabIndex={-1}
          initial={{ opacity: 0, y: reduced ? 0 : 24, scale: reduced ? 1 : 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduced ? 0 : 16, scale: reduced ? 1 : 0.98 }}
          transition={spring.soft}
          className="relative my-auto flex w-full max-w-lg flex-col gap-6 rounded-2xl border border-line bg-surface p-6 shadow-float outline-none sm:p-8"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              done();
            }
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div
              className="flex items-center gap-2"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-valuenow={index + 1}
              aria-valuetext={t.step(index + 1, steps.length)}
              aria-label={t.progress}
            >
              {steps.map((id, i) => (
                <motion.span
                  key={id}
                  className={cn('h-2 rounded-full', i <= index ? 'bg-accent' : 'bg-line-strong')}
                  animate={{ width: i === index ? 24 : 8 }}
                  transition={spring.default}
                />
              ))}
            </div>
            {!last && (
              <Button variant="ghost" size="sm" onClick={done} data-testid="onboarding-skip">
                {t.skip}
              </Button>
            )}
          </div>

          <div className="relative overflow-hidden">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                initial={{ opacity: 0, x: direction * offset }}
                animate={{ opacity: 1, x: 0, transition: { duration: 0.28, ease: easeOut } }}
                exit={{ opacity: 0, x: -direction * offset, transition: { duration: 0.15 } }}
                data-testid={`onboarding-step-${step}`}
              >
                {step === 'welcome' && <WelcomeStep />}
                {step === 'install' && <InstallStep />}
                {step === 'ai' && <AiStep />}
                {step === 'start' && <StartStep onDone={done} />}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between gap-3">
            {index > 0 ? (
              <Button variant="ghost" icon={ArrowLeft} onClick={() => go(index - 1)}>
                {t.back}
              </Button>
            ) : (
              <span />
            )}
            {!last && (
              <Button onClick={() => go(index + 1)} data-testid="onboarding-next" data-autofocus>
                {t.next}
                <ArrowRight size={18} aria-hidden />
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}
