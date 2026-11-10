const controlBase =
  'w-full min-h-[var(--control-height)] rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white px-3 py-2 text-[15px] text-[var(--color-ink)] placeholder:text-[#8b93a7] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/25 disabled:cursor-not-allowed disabled:bg-[var(--color-surface)] disabled:text-[var(--color-ink-muted)]';

export function Field({ label, children, hint, required }) {
  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="app-label mb-0">
          {label}
          {required ? <span className="ml-0.5 text-[var(--color-danger)]">*</span> : null}
        </span>
      )}
      {children}
      {hint && <span className="block text-xs leading-snug text-[var(--color-ink-muted)]">{hint}</span>}
    </label>
  );
}

export function TextInput({ className = '', ...props }) {
  return <input className={`${controlBase} ${className}`} {...props} />;
}

export function TextArea({ className = '', ...props }) {
  return (
    <textarea
      className={`${controlBase} min-h-[5.5rem] resize-y py-2.5 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${controlBase} appearance-auto pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
}
