export default function ChartCard({ title, description, children, className = '' }) {
  return (
    <div className={`app-card ${className}`}>
      <div className="mb-4">
        <h2 className="app-section-title">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
