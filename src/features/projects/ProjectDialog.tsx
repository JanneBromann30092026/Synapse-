import { useId, useState, type FormEvent } from 'react';
import {
  Button,
  ColorPicker,
  IconPicker,
  Input,
  Modal,
  PROJECT_ICONS,
  Textarea,
  toast,
  Toggle,
  projectColor,
  type ProjectIconName,
} from '@/components/ui';
import { ValidationError } from '@/data/errors';
import { projectsRepo } from '@/data/repositories';
import { LIMITS } from '@/data/schemas';
import type { Project, ProjectColor } from '@/data/types';
import { de } from '@/i18n/de';
import { ProjectCardView } from './ProjectCard';

const t = de.pages.projects;
const d = t.dialog;

export interface ProjectDialogProps {
  open: boolean;
  onClose: () => void;
  /** Project to edit; omit to create a new one. */
  project?: Project & { cardCount?: number; lastStudiedAt?: string };
  /** Called with the saved project (e.g. to navigate to a new one). */
  onSaved?: (project: Project) => void;
}

type FieldErrors = Partial<Record<'name' | 'description', string>>;

function toIconName(icon: string | undefined): ProjectIconName | undefined {
  return icon && icon in PROJECT_ICONS ? (icon as ProjectIconName) : undefined;
}

function messageFor(error: ValidationError): string {
  if (error.code === 'required') return d.errors.nameRequired;
  if (error.code === 'tooLong') {
    return d.errors.tooLong(
      error.field === 'description' ? LIMITS.projectDescription : LIMITS.projectName,
    );
  }
  return d.errors.invalid;
}

/**
 * Create/edit dialog with live preview. Mount it with a new `key` for every opening so the
 * form starts from the project's current values.
 */
export function ProjectDialog({ open, onClose, project, onSaved }: ProjectDialogProps) {
  const formId = useId();
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [color, setColor] = useState<ProjectColor>(project?.color ?? 'indigo');
  const [icon, setIcon] = useState<ProjectIconName | undefined>(toIconName(project?.icon));
  const [includeInBrain, setIncludeInBrain] = useState(project?.includeInBrain ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      setErrors({ name: d.errors.nameRequired });
      return;
    }
    setSaving(true);
    setErrors({});
    // An empty string removes the optional field (see applyPatch).
    const input = { name, description, color, icon: icon ?? '', includeInBrain };
    try {
      const saved = project
        ? await projectsRepo.update(project.id, input)
        : await projectsRepo.create(input);
      toast.success(project ? t.toasts.saved : t.toasts.created(saved.name));
      onSaved?.(saved);
      onClose();
    } catch (error: unknown) {
      if (
        error instanceof ValidationError &&
        (error.field === 'name' || error.field === 'description')
      ) {
        setErrors({ [error.field]: messageFor(error) });
      } else {
        toast.error(t.toasts.failed);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? d.editTitle : d.createTitle}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {de.ui.cancel}
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {project ? d.save : d.create}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_260px]">
        <form
          id={formId}
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-5"
          noValidate
        >
          <Input
            label={d.name}
            placeholder={d.namePlaceholder}
            value={name}
            maxLength={LIMITS.projectName}
            onChange={(event) => {
              setName(event.target.value);
              if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
            }}
            error={errors.name}
            enterKeyHint="done"
            autoComplete="off"
            data-autofocus
            required
          />
          <Textarea
            label={d.description}
            placeholder={d.descriptionPlaceholder}
            value={description}
            maxLength={LIMITS.projectDescription}
            rows={2}
            onChange={(event) => setDescription(event.target.value)}
            error={errors.description}
          />
          <div className="flex flex-col gap-2">
            <span className="px-1 text-sm font-medium text-fg-secondary">{d.color}</span>
            <ColorPicker value={color} onChange={setColor} label={d.color} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="px-1 text-sm font-medium text-fg-secondary">{d.icon}</span>
            <IconPicker
              value={icon}
              onChange={setIcon}
              color={projectColor(color)}
              label={d.icon}
            />
          </div>
          <Toggle
            label={d.includeInBrain}
            description={d.includeInBrainHint}
            checked={includeInBrain}
            onChange={setIncludeInBrain}
          />
        </form>
        <aside className="order-first flex flex-col gap-2 sm:sticky sm:top-0 sm:order-last sm:self-start">
          <span className="px-1 text-sm font-medium text-fg-secondary">{d.preview}</span>
          <div aria-hidden className="pointer-events-none min-h-56">
            <ProjectCardView
              project={{
                name: name.trim(),
                description: description.trim() || undefined,
                color,
                icon,
                archived: project?.archived ?? false,
                cardCount: project?.cardCount ?? 0,
                lastStudiedAt: project?.lastStudiedAt,
              }}
            />
          </div>
        </aside>
      </div>
    </Modal>
  );
}
