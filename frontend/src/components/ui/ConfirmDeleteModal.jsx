import { AlertTriangle, LoaderCircle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

/**
 * Shared confirmation dialog for all destructive actions.
 */
export default function ConfirmDeleteModal({
  open,
  title = 'Confirm delete',
  message,
  itemName,
  confirmLabel = 'Delete',
  loading = false,
  onConfirm,
  onClose,
}) {
  return (
    <Modal open={open} title={title} onClose={() => !loading && onClose?.()}>
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-[var(--color-danger)]">
            <AlertTriangle size={20} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 space-y-1">
            {itemName && (
              <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{itemName}</p>
            )}
            <p className="text-sm text-[var(--color-ink-muted)]">
              {message ||
                'Are you sure you want to delete this? Related history is kept; the item will be removed from active lists.'}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" type="button" disabled={loading} onClick={onConfirm}>
            {loading ? (
              <>
                <LoaderCircle size={16} className="animate-spin" />
                Deleting…
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
