import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ClipboardPaste, CornerDownLeft, TriangleAlert } from 'lucide-react';
import { Button, Modal, TagInput, Textarea, toast, useImeGuard } from '@/components/ui';
import { normalizeCardText } from '@/core/cards';
import { ValidationError } from '@/data/errors';
import { cardsRepo } from '@/data/repositories';
import { LIMITS } from '@/data/schemas';
import type { Card } from '@/data/types';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';

const t = de.pages.editor;

export interface CardEditorProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** Card to edit; omit for quick entry of new cards. */
  card?: Card;
  /** Tags already used in the project (offered as suggestions). */
  projectTags?: string[];
  /** Switches to pasting several cards at once (only offered for new cards). */
  onPasteMany?: () => void;
}

type Field = 'front' | 'back' | 'notes';
type SaveMode = 'next' | 'close';

/** No autocorrect or auto-capitalization: answers are compared literally when studying. */
const plainTextProps = {
  autoCapitalize: 'off',
  autoCorrect: 'off',
  spellCheck: false,
} as const;

function messageFor(error: ValidationError): string {
  if (error.code === 'required') {
    return error.field === 'back' ? t.errors.backRequired : t.errors.frontRequired;
  }
  if (error.code === 'tooLong')
    return t.errors.tooLong(error.field === 'notes' ? LIMITS.cardNotes : LIMITS.cardText);
  return t.errors.invalid;
}

/**
 * Card editor for quick entry ("Speichern & nächste" keeps the keyboard open) and editing.
 * Mount with a new `key` for every opening.
 */
export function CardEditor({
  open,
  onClose,
  projectId,
  card,
  projectTags = [],
  onPasteMany,
}: CardEditorProps) {
  const isEdit = card !== undefined;
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);
  const ime = useImeGuard();

  const [front, setFront] = useState(card?.front ?? '');
  const [back, setBack] = useState(card?.back ?? '');
  const [notes, setNotes] = useState(card?.notes ?? '');
  const [notesOpen, setNotesOpen] = useState(Boolean(card?.notes));
  const [tags, setTags] = useState<string[]>(card?.tags ?? []);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [duplicate, setDuplicate] = useState<{ card: Card; mode: SaveMode } | null>(null);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const isEmpty = !front.trim() && !back.trim() && !notes.trim();

  const reset = () => {
    setFront('');
    setBack('');
    setNotes('');
    setErrors({});
    setDuplicate(null);
    // Tags are kept: consecutive cards usually share them.
    frontRef.current?.focus();
  };

  const save = async (mode: SaveMode, allowDuplicate = false) => {
    if (saving) return;
    if (!isEdit && mode === 'close' && isEmpty) {
      onClose();
      return;
    }
    const nextErrors: Partial<Record<Field, string>> = {};
    if (!front.trim()) nextErrors.front = t.errors.frontRequired;
    if (!back.trim()) nextErrors.back = t.errors.backRequired;
    if (nextErrors.front ?? nextErrors.back) {
      setErrors(nextErrors);
      (nextErrors.front ? frontRef : backRef).current?.focus();
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const key = normalizeCardText(front);
      const frontChanged = !isEdit || normalizeCardText(card.front) !== key;
      if (frontChanged && !allowDuplicate && confirmedDuplicate !== key) {
        const existing = await cardsRepo.findDuplicate(projectId, front, card?.id);
        if (existing) {
          setDuplicate({ card: existing, mode });
          return;
        }
      }
      // Empty notes remove the field (see applyPatch).
      const input = { front, back, notes, tags };
      if (isEdit) {
        await cardsRepo.update(card.id, input);
        toast.success(de.pages.project.toasts.saved);
        onClose();
      } else {
        await cardsRepo.create(projectId, input);
        setAddedCount((n) => n + 1);
        setConfirmedDuplicate(null);
        if (mode === 'close') onClose();
        else reset();
      }
    } catch (error: unknown) {
      if (error instanceof ValidationError && ['front', 'back', 'notes'].includes(error.field)) {
        setErrors({ [error.field]: messageFor(error) });
      } else {
        toast.error(de.pages.project.toasts.failed);
      }
    } finally {
      setSaving(false);
    }
  };

  const primaryMode: SaveMode = isEdit ? 'close' : 'next';

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, field?: Field) => {
    if (event.key !== 'Enter' || ime.isComposing(event)) return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      void save(primaryMode);
    } else if (!event.shiftKey && !event.altKey && field === 'front') {
      // Return on the front side jumps to the back side (Shift+Return = line break).
      event.preventDefault();
      backRef.current?.focus();
    } else if (!event.shiftKey && !event.altKey && field === 'back') {
      event.preventDefault();
      void save(primaryMode);
    }
  };

  // Buttons must not take the focus: on iPadOS that would close the on-screen keyboard.
  const keepFocus = { onMouseDown: (event: MouseEvent) => event.preventDefault() };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t.editTitle : t.createTitle}
      size="lg"
      footer={
        <>
          <span
            className="mr-auto flex min-h-11 items-center text-sm text-fg-muted"
            aria-live="polite"
          >
            {!isEdit && addedCount > 0 ? (
              <motion.span
                key={addedCount}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-medium text-success"
              >
                {t.addedCount(addedCount)}
              </motion.span>
            ) : (
              <span className="hidden wide:inline">{t.shortcutHint}</span>
            )}
          </span>
          {isEdit ? (
            <>
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                {de.ui.cancel}
              </Button>
              <Button onClick={() => void save('close')} loading={saving} {...keepFocus}>
                {t.save}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => void save('close')}
                disabled={saving}
                {...keepFocus}
              >
                {t.done}
              </Button>
              <Button
                size="lg"
                icon={CornerDownLeft}
                onClick={() => void save('next')}
                loading={saving}
                {...keepFocus}
              >
                {t.saveAndNext}
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4" onKeyDown={(event) => onKeyDown(event)}>
        {!isEdit && onPasteMany && (
          <Button
            size="sm"
            variant="ghost"
            icon={ClipboardPaste}
            onClick={onPasteMany}
            className="-mt-2 -mb-2 self-end"
            data-testid="paste-many"
          >
            {t.pasteMany}
          </Button>
        )}
        <Textarea
          textareaRef={frontRef}
          label={t.front}
          placeholder={t.frontPlaceholder}
          value={front}
          rows={2}
          maxLength={LIMITS.cardText}
          error={errors.front}
          enterKeyHint="next"
          data-autofocus
          data-testid="card-front"
          {...plainTextProps}
          {...ime.compositionProps}
          onChange={(event) => {
            setFront(event.target.value);
            setDuplicate(null);
            if (errors.front) setErrors((e) => ({ ...e, front: undefined }));
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            onKeyDown(event, 'front');
          }}
        />

        <AnimatePresence initial={false}>
          {duplicate && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring.default}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-warning-soft px-4 py-3 text-sm text-fg">
                <TriangleAlert size={18} aria-hidden className="shrink-0 text-warning" />
                <span className="min-w-48 flex-1">{t.duplicate(duplicate.card.front)}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  {...keepFocus}
                  onClick={() => {
                    setConfirmedDuplicate(normalizeCardText(front));
                    setDuplicate(null);
                    void save(duplicate.mode, true);
                  }}
                >
                  {t.saveAnyway}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Textarea
          textareaRef={backRef}
          label={t.back}
          placeholder={t.backPlaceholder}
          hint={errors.back ? undefined : t.backHint}
          value={back}
          rows={2}
          maxLength={LIMITS.cardText}
          error={errors.back}
          enterKeyHint={isEdit ? 'done' : 'next'}
          data-testid="card-back"
          {...plainTextProps}
          {...ime.compositionProps}
          onChange={(event) => {
            setBack(event.target.value);
            if (errors.back) setErrors((e) => ({ ...e, back: undefined }));
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            onKeyDown(event, 'back');
          }}
        />

        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen((v) => !v)}
            className="focus-ring flex min-h-11 items-center gap-2 self-start rounded-full px-1 text-sm font-medium text-accent"
          >
            <motion.span
              animate={{ rotate: notesOpen ? 180 : 0 }}
              transition={spring.snappy}
              className="flex"
            >
              <ChevronDown size={18} aria-hidden />
            </motion.span>
            {notesOpen ? t.hideNotes : t.addNotes}
          </button>
          <AnimatePresence initial={false}>
            {notesOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={spring.default}
                className="overflow-hidden"
              >
                <Textarea
                  label={t.notes}
                  placeholder={t.notesPlaceholder}
                  value={notes}
                  rows={2}
                  maxLength={LIMITS.cardNotes}
                  error={errors.notes}
                  {...ime.compositionProps}
                  onChange={(event) => setNotes(event.target.value)}
                  className="mb-1"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <TagInput
          label={t.tags}
          value={tags}
          onChange={setTags}
          placeholder={t.tagsPlaceholder}
          suggestions={projectTags}
          suggestionsLabel={t.suggestions}
          removeLabel={t.removeTag}
        />
      </div>
    </Modal>
  );
}
