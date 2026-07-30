import { Modal } from './modal';
import { Button } from './button';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  confirmDisabled?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  loading,
  confirmDisabled,
  error,
  onConfirm,
  onClose,
  children,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-fog">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
      {error ? (
        <p role="alert" className="mt-4 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={destructive ? 'primary' : 'primary'}
          className={destructive ? 'bg-danger text-vellum hover:bg-danger-deep' : undefined}
          loading={loading}
          disabled={loading || confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
