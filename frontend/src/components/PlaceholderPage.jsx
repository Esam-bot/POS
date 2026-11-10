export default function PlaceholderPage({ title, description }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-8 shadow-sm">
      <h1 className="app-title">{title}</h1>
      <p className="mt-2 max-w-2xl text-[var(--color-ink-muted)]">
        {description || 'This module will be implemented in a later phase.'}
      </p>
    </div>
  );
}
