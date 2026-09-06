import Link from "next/link";

import { Card } from "@bdas/design-system";

import { AccountAvatar } from "./AccountAvatar";
import type { IdentityRow, RoleChip } from "./view-model";

export type IdentityColumnProps = {
  photoUrl: string | null;
  initials: string;
  name: string;
  email: string;
  rows: ReadonlyArray<IdentityRow>;
  chips: ReadonlyArray<RoleChip>;
};

/**
 * Who the member is in this federation and what they may do. Fixed beside the
 * content column so the answer stays on screen while the rest scrolls — it is
 * the question the old page never answered at all.
 */
export function IdentityColumn({
  photoUrl,
  initials,
  name,
  email,
  rows,
  chips,
}: IdentityColumnProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6">
        <div className="flex flex-col items-start gap-4">
          <AccountAvatar photoUrl={photoUrl} initials={initials} />
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-semibold text-bdas-ink">{name}</h2>
            <p className="text-sm text-bdas-ink-muted">{email}</p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-[minmax(0,6rem)_1fr] gap-x-4 gap-y-2 border-t border-bdas-soft pt-5 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-bdas-ink-muted">{row.label}</dt>
              <dd className="text-bdas-ink">{row.value}</dd>
            </div>
          ))}
        </dl>

        {chips.length > 0 ? (
          <div className="mt-5 border-t border-bdas-soft pt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-bdas-ink-muted">
              Deine Rollen
            </h3>
            <ul className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <li
                  key={chip.label}
                  className={
                    chip.accent
                      ? "rounded-bdas-pill border border-bdas-soft bg-bdas-overlay-faint px-3 py-1 text-sm text-bdas-red"
                      : "rounded-bdas-pill border border-bdas-soft px-3 py-1 text-sm text-bdas-ink-body"
                  }
                >
                  {chip.label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-bdas-ink-muted">
              Rollen vergibt der Vorstand deiner Gruppe.
            </p>
          </div>
        ) : null}
      </Card>

      <Card flat className="p-4">
        <div className="flex flex-col items-start gap-1 text-sm">
          <Link href="/account/einstellungen" className="text-bdas-ink-body hover:underline">
            Kontoeinstellungen →
          </Link>
          <form action="/abmelden" method="post">
            <button type="submit" className="text-bdas-ink-body hover:underline">
              Abmelden
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
