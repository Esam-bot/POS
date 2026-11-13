export default function EmptyState({ title, description, action, icon: Icon }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-line)] bg-white px-6 py-10 text-center">
      {Icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-section)] text-[var(--color-ink-muted)]">
          <Icon size={20} strokeWidth={1.75} />
        </div>
      ) : null}
      <p className="text-base font-semibold text-[var(--color-ink)]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-[var(--color-ink-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
