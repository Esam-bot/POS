const tones = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  muted: 'bg-slate-100 text-slate-600 border-slate-200',
  brand: 'bg-[var(--color-brand-soft)] text-[var(--color-brand-dark)] border-teal-200',
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
