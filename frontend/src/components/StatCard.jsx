export function StatCard({ title, value, hint, badge }) {
  return (
    <div className="card stat-card">
      <div className="stat-head">
        <p className="label">{title}</p>
        {badge && <span className={`stat-badge stat-badge-${badge.level}`}>{badge.text}</span>}
      </div>
      <h3>{value}</h3>
      <p className="hint">{hint}</p>
    </div>
  );
}
