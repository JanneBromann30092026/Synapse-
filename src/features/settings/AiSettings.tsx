import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CircleAlert,
  CircleCheck,
  ClipboardPaste,
  ExternalLink,
  KeyRound,
  RotateCcw,
  Trash2,
  Wifi,
} from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  SegmentedControl,
  Skeleton,
  toast,
} from '@/components/ui';
import { useLiveData } from '@/data/live';
import { secretsRepo } from '@/data/repositories';
import { de } from '@/i18n/de';
import {
  AI_PROVIDERS,
  AiError,
  DEFAULT_AI_MODEL,
  removeApiKey,
  saveApiKey,
  testAiConnection,
} from '@/services/ai';
import { spring } from '@/styles/motion';
import { isValidSetting, useSettings } from './settingsStore';

const t = de.settings.ai;
const CONSOLE_URL = 'https://console.anthropic.com/';

const providerOptions = AI_PROVIDERS.map((value) => ({ value, label: t.providerOptions[value] }));

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

function errorMessage(error: unknown): string {
  return error instanceof AiError
    ? de.settings.aiErrors[error.code]
    : de.settings.aiErrors.API_ERROR;
}

/** API key: can be set, replaced and removed – but never shown again. */
function ApiKeyField() {
  const hasKey = useLiveData(() => secretsRepo.has('anthropicApiKey'));
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await saveApiKey(draft);
      if (result === 'ok') {
        setDraft('');
        setError(undefined);
        toast.success(t.keySaved);
      } else {
        setError(t.keyErrors[result]);
      }
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setDraft(text.trim());
      setError(undefined);
    } catch {
      toast.info(t.pasteFailed);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3" noValidate>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-base text-fg">
          <KeyRound size={18} aria-hidden className="text-fg-muted" />
          {t.key}
        </span>
        <Badge tone={hasKey ? 'success' : 'neutral'}>
          <span data-testid="api-key-status">{hasKey ? t.keyStored : t.keyMissing}</span>
        </Badge>
      </div>
      <Input
        type="password"
        aria-label={t.key}
        className="font-mono"
        placeholder={t.keyPlaceholder}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(undefined);
        }}
        error={error}
        hint={hasKey ? t.keyReplaceHint : undefined}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        data-1p-ignore
        data-lpignore="true"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" icon={KeyRound} loading={busy} disabled={!draft.trim()}>
          {t.saveKey}
        </Button>
        <Button size="sm" variant="secondary" icon={ClipboardPaste} onClick={() => void paste()}>
          {t.paste}
        </Button>
        {hasKey && (
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmRemove(true)}>
            {t.removeKey}
          </Button>
        )}
      </div>
      <p className="text-sm text-fg-muted">
        {t.keyHint}{' '}
        <a
          href={CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-flex items-center gap-1 rounded-sm font-medium text-accent"
        >
          {t.consoleLink}
          <ExternalLink size={13} aria-hidden />
        </a>
      </p>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={async () => {
          await removeApiKey();
          toast.success(t.keyRemoved);
        }}
        title={t.removeTitle}
        message={t.removeText}
        confirmLabel={t.removeKey}
      />
    </form>
  );
}

/** Model name: saved when leaving the field (or on Enter) if valid. */
function ModelField() {
  const model = useSettings((s) => s.aiModel);
  const set = useSettings((s) => s.set);
  const [draft, setDraft] = useState(model);
  const [error, setError] = useState<string | undefined>();

  const commit = (value: string) => {
    const next = value.trim();
    if (next === model) return;
    if (!isValidSetting('aiModel', next)) {
      setError(t.modelInvalid);
      return;
    }
    setError(undefined);
    void set('aiModel', next);
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        label={t.model}
        value={draft}
        className="font-mono"
        onChange={(event) => {
          setDraft(event.target.value);
          setError(undefined);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            commit(draft);
          }
        }}
        error={error}
        hint={t.modelHint(DEFAULT_AI_MODEL)}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
      />
      {model !== DEFAULT_AI_MODEL && (
        <Button
          size="sm"
          variant="ghost"
          icon={RotateCcw}
          className="self-start"
          onClick={() => {
            setDraft(DEFAULT_AI_MODEL);
            setError(undefined);
            void set('aiModel', DEFAULT_AI_MODEL);
          }}
        >
          {t.modelReset}
        </Button>
      )}
    </div>
  );
}

function ConnectionTest() {
  const provider = useSettings((s) => s.aiProvider);
  const model = useSettings((s) => s.aiModel);
  const [state, setState] = useState<TestState>({ status: 'idle' });

  const run = async () => {
    setState({ status: 'testing' });
    try {
      const result = await testAiConnection({ provider, model });
      setState({ status: 'ok', message: t.testOk(result.displayName) });
    } catch (error: unknown) {
      setState({ status: 'error', message: errorMessage(error) });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="secondary"
        icon={Wifi}
        loading={state.status === 'testing'}
        onClick={() => void run()}
        className="self-start"
      >
        {state.status === 'testing' ? t.testing : t.test}
      </Button>
      <AnimatePresence mode="wait" initial={false}>
        {(state.status === 'ok' || state.status === 'error') && (
          <motion.div
            key={`${state.status}-${state.message}`}
            role={state.status === 'error' ? 'alert' : 'status'}
            data-testid="connection-result"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={spring.default}
            className={
              state.status === 'ok'
                ? 'flex items-start gap-3 rounded-lg bg-success-soft px-4 py-3 text-base text-fg'
                : 'flex items-start gap-3 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg'
            }
          >
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...spring.snappy, delay: 0.08 }}
              className={state.status === 'ok' ? 'text-success' : 'text-danger'}
            >
              {state.status === 'ok' ? (
                <CircleCheck size={22} aria-hidden />
              ) : (
                <CircleAlert size={22} aria-hidden />
              )}
            </motion.span>
            <span>{state.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AiSettings() {
  const provider = useSettings((s) => s.aiProvider);
  const loaded = useSettings((s) => s.loaded);
  const set = useSettings((s) => s.set);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-base text-fg">{t.provider}</span>
        <SegmentedControl
          label={t.provider}
          options={providerOptions}
          value={provider}
          onChange={(value) => void set('aiProvider', value)}
        />
      </div>
      {provider === 'off' ? (
        <p className="text-sm text-fg-muted">{t.offHint}</p>
      ) : (
        <>
          <div className="h-px bg-line" />
          <ApiKeyField />
          <div className="h-px bg-line" />
          {/* Only after loading: the draft starts from the stored model and is never reset while typing. */}
          {loaded ? <ModelField /> : <Skeleton className="h-20 w-full" />}
          <ConnectionTest />
        </>
      )}
    </div>
  );
}
