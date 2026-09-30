import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Check, Copy, Info, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  ActionMenu,
  ActionMenuButton,
  Badge,
  BottomSheet,
  Button,
  ColorPicker,
  ConfirmDialog,
  EmptyState,
  IconButton,
  IconPicker,
  Input,
  Modal,
  ProgressBar,
  ProgressRing,
  projectColor,
  SegmentedControl,
  Select,
  Skeleton,
  Slider,
  Spinner,
  Surface,
  Textarea,
  toast,
  Toggle,
  Tooltip,
  useLongPress,
  type ActionMenuItem,
  type BadgeTone,
  type MenuAnchor,
  type ProjectIconName,
} from '@/components/ui';
import { Page } from '@/app/shell/Page';
import type { ProjectColor } from '@/data/types';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { DemoDataSection } from './DemoDataSection';
import { GradingPlayground } from './GradingPlayground';
import { SessionPlayground } from './SessionPlayground';

const t = de.dev;
const d = de.dev.demo;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" data-testid={`dev-section-${id}`}>
      <h2 className="px-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">{title}</h2>
      <Surface className="flex flex-col gap-5">{children}</Surface>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function ButtonsDemo() {
  return (
    <>
      <Row>
        <Button>{d.primary}</Button>
        <Button variant="secondary">{d.secondary}</Button>
        <Button variant="ghost">{d.ghost}</Button>
        <Button variant="danger" icon={Trash2}>
          {d.danger}
        </Button>
        <Button variant="success" icon={Check}>
          {d.success}
        </Button>
      </Row>
      <Row>
        <Button size="sm">{d.small}</Button>
        <Button size="md">{d.medium}</Button>
        <Button size="lg">{d.large}</Button>
        <Button icon={Plus} variant="secondary">
          {d.withIcon}
        </Button>
        <Button loading>{d.loading}</Button>
        <Button disabled variant="secondary">
          {d.disabled}
        </Button>
      </Row>
      <Row>
        <IconButton icon={Plus} label={d.add} variant="primary" />
        <IconButton icon={Pencil} label={de.dev.demo.menu.edit} variant="secondary" />
        <IconButton icon={Copy} label={de.dev.demo.menu.duplicate} />
        <IconButton icon={Trash2} label={de.dev.demo.menu.delete} variant="danger" />
        <IconButton icon={Plus} label={d.add} variant="primary" size="lg" />
      </Row>
    </>
  );
}

function InputsDemo() {
  const [front, setFront] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Input
        label={d.inputLabel}
        placeholder={d.inputPlaceholder}
        hint={d.inputHint}
        value={front}
        onChange={(e) => setFront(e.target.value)}
      />
      <Input
        label={d.inputLabel}
        placeholder={d.inputPlaceholder}
        error={d.inputError}
        defaultValue=""
      />
      <Textarea
        label={d.textareaLabel}
        placeholder={d.textareaPlaceholder}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="sm:col-span-2"
      />
    </div>
  );
}

type DirectionDemo = keyof typeof d.selectOptions;
type StrictnessDemo = keyof typeof d.segmentOptions;

function ControlsDemo() {
  const [direction, setDirection] = useState<DirectionDemo>('front');
  const [strictness, setStrictness] = useState<StrictnessDemo>('meaning');
  const [inBrain, setInBrain] = useState(true);
  const [tolerance, setTolerance] = useState(0.85);
  const directionOptions = (Object.keys(d.selectOptions) as DirectionDemo[]).map((value) => ({
    value,
    label: d.selectOptions[value],
  }));
  const strictnessOptions = (Object.keys(d.segmentOptions) as StrictnessDemo[]).map((value) => ({
    value,
    label: d.segmentOptions[value],
  }));
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Select
        label={d.selectLabel}
        options={directionOptions}
        value={direction}
        onChange={setDirection}
      />
      <div className="flex flex-col gap-1.5">
        <span className="px-1 text-sm font-medium text-fg-secondary">{d.segmentLabel}</span>
        <SegmentedControl
          label={d.segmentLabel}
          options={strictnessOptions}
          value={strictness}
          onChange={setStrictness}
        />
      </div>
      <Toggle label={d.toggleLabel} checked={inBrain} onChange={setInBrain} />
      <Slider
        label={d.sliderLabel}
        value={tolerance}
        onChange={setTolerance}
        min={0.5}
        max={1}
        step={0.01}
        format={(v) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2 }).format(v)}
      />
    </div>
  );
}

const BADGE_TONES: BadgeTone[] = ['neutral', 'accent', 'success', 'danger', 'warning'];

function FeedbackDemo() {
  return (
    <>
      <Row>
        {BADGE_TONES.map((tone) => (
          <Badge key={tone} tone={tone}>
            {d.badges[tone]}
          </Badge>
        ))}
        <Tooltip content={d.tooltipText} showOnTap>
          <IconButton icon={Info} label={d.tooltipTrigger} variant="secondary" />
        </Tooltip>
      </Row>
      <Row>
        <Button variant="secondary" onClick={() => toast.info(d.toastInfoText)}>
          {d.toastInfo}
        </Button>
        <Button variant="secondary" onClick={() => toast.success(d.toastSuccessText)}>
          {d.toastSuccess}
        </Button>
        <Button variant="secondary" onClick={() => toast.error(d.toastErrorText)}>
          {d.toastError}
        </Button>
      </Row>
      <Row>
        <span className="text-accent">
          <Spinner size={28} label={de.ui.loading} />
        </span>
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </Row>
    </>
  );
}

function ProgressDemo() {
  return (
    <div className="flex flex-wrap items-center gap-8">
      <ProgressRing value={0.3} label="30 %" size={96} />
      <ProgressRing value={0.65} label="65 %" size={96} />
      <ProgressRing value={1} label="100 %" size={120} />
      <div className="flex min-w-48 flex-1 flex-col gap-3">
        <ProgressBar value={0.25} label="25 %" />
        <ProgressBar value={0.6} label="60 %" tone="warning" />
        <ProgressBar value={0.9} label="90 %" tone="success" />
      </div>
    </div>
  );
}

function OverlaysDemo() {
  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const longPress = useLongPress((point) => setMenuAnchor(point));
  const items: ActionMenuItem[] = [
    {
      id: 'edit',
      label: d.menu.edit,
      icon: Pencil,
      onSelect: () => toast.info(d.menuSelected(d.menu.edit)),
    },
    {
      id: 'duplicate',
      label: d.menu.duplicate,
      icon: Copy,
      onSelect: () => toast.info(d.menuSelected(d.menu.duplicate)),
    },
    {
      id: 'delete',
      label: d.menu.delete,
      icon: Trash2,
      danger: true,
      onSelect: () => setConfirm(true),
    },
  ];
  return (
    <>
      <Row>
        <Button variant="secondary" onClick={() => setModal(true)}>
          {d.openModal}
        </Button>
        <Button variant="secondary" onClick={() => setSheet(true)}>
          {d.openSheet}
        </Button>
        <Button variant="secondary" onClick={() => setConfirm(true)}>
          {d.openConfirm}
        </Button>
      </Row>
      <Row>
        <ActionMenuButton items={items} />
        <div
          {...longPress.handlers}
          className="no-callout flex min-h-20 flex-1 items-center justify-center rounded-lg border border-dashed border-line-strong text-fg-secondary"
        >
          {d.longPressArea}
        </div>
      </Row>
      <p className="text-sm text-fg-muted">{d.menuHint}</p>

      <ActionMenu
        open={menuAnchor !== null}
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        items={items}
      />
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={d.modalTitle}
        description={d.modalText}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>
              {de.ui.cancel}
            </Button>
            <Button onClick={() => setModal(false)}>{d.success}</Button>
          </>
        }
      >
        <Input label={d.inputLabel} placeholder={d.inputPlaceholder} />
      </Modal>
      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title={d.sheetTitle}
        description={d.sheetText}
        footer={
          <Button size="lg" fullWidth onClick={() => setSheet(false)}>
            {d.success}
          </Button>
        }
      >
        <Toggle label={d.toggleLabel} checked onChange={() => undefined} />
      </BottomSheet>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void toast.success(d.toastSuccessText)}
        title={d.confirmTitle}
        message={d.confirmText}
        confirmLabel={d.confirmAction}
      />
    </>
  );
}

function PickersDemo() {
  const [color, setColor] = useState<ProjectColor>('indigo');
  const [icon, setIcon] = useState<ProjectIconName | undefined>('languages');
  return (
    <>
      <ColorPicker value={color} onChange={setColor} />
      <IconPicker value={icon} onChange={setIcon} color={projectColor(color)} />
    </>
  );
}

/** Component overview in all variants (only with developer mode). */
export default function DevUiPage() {
  const devMode = useSettings((s) => s.devMode);
  const loaded = useSettings((s) => s.loaded);
  const navigate = useNavigate();

  if (!devMode) {
    return (
      <Page title={t.title}>
        {loaded && (
          <EmptyState
            title={t.disabledTitle}
            text={t.disabledText}
            action={<Button onClick={() => void navigate('/settings')}>{t.openSettings}</Button>}
          />
        )}
      </Page>
    );
  }

  return (
    <Page title={t.title}>
      <div className="flex flex-col gap-8">
        <DemoDataSection />
        <GradingPlayground />
        <SessionPlayground />
        <Section id="buttons" title={t.sections.buttons}>
          <ButtonsDemo />
        </Section>
        <Section id="inputs" title={t.sections.inputs}>
          <InputsDemo />
        </Section>
        <Section id="controls" title={t.sections.controls}>
          <ControlsDemo />
        </Section>
        <Section id="feedback" title={t.sections.feedback}>
          <FeedbackDemo />
        </Section>
        <Section id="progress" title={t.sections.progress}>
          <ProgressDemo />
        </Section>
        <Section id="overlays" title={t.sections.overlays}>
          <OverlaysDemo />
        </Section>
        <Section id="pickers" title={t.sections.pickers}>
          <PickersDemo />
        </Section>
        <Section id="empty" title={t.sections.empty}>
          <EmptyState
            title={d.emptyTitle}
            text={d.emptyText}
            action={<Button icon={Plus}>{d.emptyAction}</Button>}
          />
        </Section>
      </div>
    </Page>
  );
}
