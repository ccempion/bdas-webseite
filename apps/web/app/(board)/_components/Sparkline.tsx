import type { SignupPoint } from "@bdas/members";

/** Minimal inline-SVG area sparkline. No charting dependency (CLAUDE.md pin). */
export function Sparkline({ points, label }: { points: SignupPoint[]; label: string }) {
  const w = 320;
  const h = 56;
  const max = Math.max(1, ...points.map((p) => p.count));
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points.map((p, i) => [i * step, h - (p.count / max) * (h - 4) - 2] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <figure className="rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card-low">
      <figcaption className="mb-2 text-bdas-icon font-semibold uppercase tracking-wide text-bdas-ink-muted">
        {label}
      </figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={label} preserveAspectRatio="none">
        <path d={area} className="fill-bdas-red" fillOpacity={0.1} />
        <path d={line} className="fill-none stroke-bdas-red" strokeWidth={2} />
      </svg>
    </figure>
  );
}
