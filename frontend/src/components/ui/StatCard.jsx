export default function StatCard({ label, value, icon: Icon, hint }) {
  return (
    <div className="app-card flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-[var(--color-ink-muted)]">{label}</p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-3xl">
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{hint}</p> : null}
      </div>
      {Icon ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <Icon size={20} strokeWidth={1.75} />
        </div>
      ) : null}
    </div>
  );
}
