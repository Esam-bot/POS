const tones = {
  success: 'bg-[var(--color-brand-soft)] text-[var(--color-brand)] border-[color-mix(in_srgb,var(--color-brand)_35%,transparent)]',
  warning: 'bg-[color-mix(in_srgb,var(--color-warning)_18%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)]',
  danger: 'bg-[color-mix(in_srgb,var(--color-danger)_18%,transparent)] text-[var(--color-danger)] border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)]',
  muted: 'bg-[var(--color-section)] text-[var(--color-ink-muted)] border-[var(--color-line)]',
  brand: 'bg-[var(--color-brand-soft)] text-[var(--color-brand)] border-[color-mix(in_srgb,var(--color-brand)_35%,transparent)]',
};

export default function Badge({ children, tone = 'muted' }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone] || tones.muted}`}
    >
      {children}
    </span>
  );
}
