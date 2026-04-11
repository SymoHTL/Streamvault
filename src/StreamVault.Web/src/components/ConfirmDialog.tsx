import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBtnClass = variant === 'danger'
    ? 'bg-danger hover:bg-red-600 text-white'
    : variant === 'warning'
    ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
    : 'bg-primary hover:bg-primary-hover text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-md mx-4 rounded-2xl bg-surface dark:bg-surface-dark border border-border dark:border-border-dark shadow-2xl"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-2.5 rounded-full shrink-0 ${
              variant === 'danger' ? 'bg-danger/10 text-danger' :
              variant === 'warning' ? 'bg-yellow-500/10 text-yellow-500' :
              'bg-primary/10 text-primary'
            }`}>
              <AlertTriangle size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-text dark:text-text-dark mb-1">{title}</h3>
              {message && <p className="text-sm text-muted dark:text-muted-dark leading-relaxed">{message}</p>}
              {children}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${confirmBtnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
