const base =
  'inline-flex min-h-[2.5rem] items-center justify-center gap-2 rounded-[var(--radius-control)] px-3.5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-55';

const variants = {
  primary: 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]',
  secondary:
    'border border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-ink)] hover:bg-[var(--color-section)]',
  danger: 'bg-[var(--color-danger)] text-white hover:bg-[#c94444]',
  success: 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]',
  ghost:
    'bg-transparent text-[var(--color-ink-muted)] hover:bg-[var(--color-section)] hover:text-[var(--color-ink)]',
};

export default function Button({
  children,
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button type={type} className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}
