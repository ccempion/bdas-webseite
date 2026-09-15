"use client";

import React, { useMemo, useState, useTransition } from "react";

import { Button, Card, FilterChip } from "@bdas/design-system";

import type { DeleteApplicantResult } from "./actions";

export type PoolRow = {
  readonly memberId: string;
  readonly userId: string;
  /** Already shortened to "A. Lastname" by the page. */
  readonly name: string;
  readonly uni: string;
  readonly days: number;
  readonly kind: "Mitglied ohne Gruppe" | "Bewerber:in";
  readonly hasProfile: boolean;
  /** Same rules the action checks again (ADR 0044). */
  readonly deletable: boolean;
};

type Filter = "all" | "no_profile";

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "no_profile", label: "Ohne Profil" },
];

/**
 * "Ohne Gruppe", filterable in the browser. "Ohne Profil" narrows to the
 * accounts that registered but never filled in the profile — where bots end
 * up — and those the board may delete carry a button.
 */
export function PoolTable({
  rows,
  onDelete,
}: {
  rows: ReadonlyArray<PoolRow>;
  /** Server action, handed in by the page so the table stays testable. */
  onDelete: (userId: string) => Promise<DeleteApplicantResult>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const visible = useMemo(
    () => rows.filter((r) => filter === "all" || !r.hasProfile),
    [rows, filter],
  );

  function remove(row: PoolRow) {
    if (
      !window.confirm(
        `Konto von ${row.name} endgültig löschen? Das lässt sich nicht rückgängig machen.`,
      )
    ) {
      return;
    }
    start(async () => {
      const res = await onDelete(row.userId);
      setNotice(res.ok ? `Konto von ${row.name} gelöscht.` : res.error);
    });
  }

  return (
    <Card flat className="overflow-x-auto p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-bdas-soft p-3">
        {FILTERS.map((f) => (
          <FilterChip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </FilterChip>
        ))}
      </div>
      {notice !== null && (
        <p role="status" className="border-b border-bdas-soft px-3 py-2 text-bdas-ink-body">
          {notice}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bdas-soft text-left text-bdas-ink-muted">
            <th className="p-3 font-semibold">Name</th>
            <th className="p-3 font-semibold">Universität</th>
            <th className="p-3 font-semibold">Im Verband seit</th>
            <th className="p-3 font-semibold">Art</th>
            <th className="p-3">
              <span className="sr-only">Aktion</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td className="p-3 text-bdas-ink-muted" colSpan={5}>
                {filter === "all"
                  ? "Niemand wartet zurzeit auf eine Gruppe."
                  : "Niemand ohne Profil."}
              </td>
            </tr>
          ) : (
            visible.map((r) => (
              <tr key={r.memberId} className="border-b border-bdas-soft">
                <td className="p-3">{r.name}</td>
                <td className="p-3">{r.uni}</td>
                <td className="p-3">{r.days} Tage</td>
                <td className="p-3 text-bdas-ink-muted">{r.kind}</td>
                <td className="p-3 text-right">
                  {r.deletable && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove(r)}>
                      Löschen
                    </Button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}
