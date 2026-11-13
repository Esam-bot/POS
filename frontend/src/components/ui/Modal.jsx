import { X } from 'lucide-react';
import { useEffect } from 'react';
import { usePosTheme } from '../../context/PosThemeContext';

export default function Modal({ open, title, onClose, children, wide = false, hideHeader = false }) {
  const isPos = usePosTheme();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`modal-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center ${
        isPos ? 'theme-pos' : ''
      }`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full overflow-visible rounded-[var(--radius-card)] border shadow-xl ${
          isPos
            ? 'theme-pos-modal border-[var(--color-line)]'
            : 'theme-light border-[var(--color-line)] bg-white text-[var(--color-ink)]'
        } ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
      >
        {!hideHeader && (
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-4">
            <h2
              className={`font-[family-name:var(--font-display)] text-lg font-semibold ${
                isPos ? 'text-[#f5f5f5]' : 'text-[var(--color-ink)]'
              }`}
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-md p-1.5 ${
                isPos
                  ? 'text-[#a1a7ae] hover:bg-[#202429] hover:text-[#f5f5f5]'
                  : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]'
              }`}
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        )}
        <div className="max-h-[min(80vh,720px)] overflow-y-auto overflow-x-visible px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
