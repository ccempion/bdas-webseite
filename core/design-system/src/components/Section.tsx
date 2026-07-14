import type { ReactNode } from "react";

import { cx } from "../cx";

export type SectionProps = {
  id?: string;
  title: string;
  intro?: string;
  /** Right-aligned header action, e.g. a "see all" link. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** Landing/content page block: consistent width, heading, optional intro. */
export function Section({ id, title, intro, action, className, children }: SectionProps) {
  return (
    <section id={id} className={cx("mx-auto w-full max-w-6xl px-4 py-12", className)}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold text-bdas-ink">{title}</h2>
          {intro ? <p className="text-bdas-ink-body">{intro}</p> : null}
        </div>
        {action ?? null}
      </header>
      {children}
    </section>
  );
}
