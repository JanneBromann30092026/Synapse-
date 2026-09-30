import { useState } from 'react';
import { de } from '@/i18n/de';
import { Button, type ButtonVariant } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Extract<ButtonVariant, 'danger' | 'primary'>;
}

/** Yes/no question; the confirm button shows a spinner while an async onConfirm runs. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = de.ui.confirm,
  cancelLabel = de.ui.cancel,
  variant = 'danger',
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      description={message}
      size="sm"
      role="alertdialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={() => void confirm()} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
