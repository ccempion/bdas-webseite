export function Tile({ value, label, muted }: { value: string; label: string; muted?: boolean }) {
  return (
    <div
      className={`flex-1 rounded-bdas border border-bdas-soft p-4 ${muted ? "opacity-40" : "bg-bdas-surface"}`}
    >
      <div className="text-2xl font-semibold text-bdas-ink">{value}</div>
      <div className="text-bdas-icon text-bdas-ink-muted">{label}</div>
    </div>
  );
}
