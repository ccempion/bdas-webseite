"use client";

import React, { useMemo, useState, useTransition } from "react";

import { Button, FilterChip, Input } from "@bdas/design-system";
import type { NewsletterSource, SubscriberRow, SubscriptionStatus } from "@bdas/newsletter";

import type { RemoveResult } from "./actions";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  subscribed: "Abonniert",
  pending: "Ausstehend",
  unsubscribed: "Abgemeldet",
  declined: "Abgelehnt",
};

/** `declined` is not `unsubscribed`: that person never was on the list, they
 *  clicked the hint away three times (spec §4). Both get their own chip. */
const FILTERS: ReadonlyArray<{ key: "all" | SubscriptionStatus; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "subscribed", label: STATUS_LABEL.subscribed },
  { key: "pending", label: STATUS_LABEL.pending },
  { key: "unsubscribed", label: STATUS_LABEL.unsubscribed },
  { key: "declined", label: STATUS_LABEL.declined },
];

const SOURCE_LABEL: Record<NewsletterSource, string> = {
  footer: "Fußzeile",
  registrierung: "Registrierung",
  registrierung_erfolg: "Nach der Registrierung",
  konto: "Konto",
  dashboard_hinweis: "Dashboard-Hinweis",
  blog: "Blog",
  event_gast: "Event-Anmeldung",
  puck_block: "Seitenbaustein",
  scroll_panel: "Scroll-Panel",
  landingpage: "Landingpage",
};

/**
 * The list, filtered in the browser. The server hands over every row anyway —
 * `listSubscribers` resolves and deduplicates in memory, so a server-side
 * filter would save no query and cost a page load per click. It also keeps the
 * searched address out of the URL and out of the server log, which matters for
 * a list of personal data (spec §8).
 */
export function SubscriberTable({
  rows,
  groupNames,
  onRemove,
  onPurge,
}: {
  rows: ReadonlyArray<SubscriberRow>;
  /** Account id → the group that person is a member of today. */
  groupNames: Record<string, string>;
  /** Server actions, handed in by the page so the table stays testable. */
  onRemove: (id: string) => Promise<RemoveResult>;
  onPurge: () => Promise<RemoveResult>;
}) {
  const [filter, setFilter] = useState<"all" | SubscriptionStatus>("all");
  const [q, setQ] = useState("");
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  function run(question: string, action: () => Promise<RemoveResult>, done: (n: number) => string) {
    if (!window.confirm(question)) return;
    start(async () => {
      const res = await action();
      setNotice(res.ok ? done(res.removed) : res.error);
    });
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (needle === "" || r.email.toLowerCase().includes(needle)),
    );
  }, [rows, filter, q]);

  return (
    <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-bdas-soft p-3">
        {FILTERS.map((f) => (
          <FilterChip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </FilterChip>
        ))}
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Adresse suchen…"
          aria-label="Adresse suchen"
          className="ml-auto w-full max-w-xs"
        />
        {/* A download is a GET on a URL, so it is a link. It exports the whole
            list, not the filtered view: a spreadsheet can filter by itself. */}
        <a
          href="/federal/newsletter/export.csv"
          className="rounded-bdas-pill border border-bdas-soft px-3 py-1 text-bdas-pill text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-overlay-hover"
        >
          Ganze Liste als CSV
        </a>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(
              "Alle unbestätigten Einträge löschen, deren Bestätigungslink abgelaufen ist oder die seit 7 Tagen auf die Kontobestätigung warten?",
              onPurge,
              (n) =>
                n === 1
                  ? "1 abgelaufener Eintrag gelöscht."
                  : `${n} abgelaufene Einträge gelöscht.`,
            )
          }
        >
          Abgelaufene löschen
        </Button>
      </div>
      {notice !== null && (
        <p role="status" className="border-b border-bdas-soft px-3 py-2 text-bdas-ink-body">
          {notice}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-bdas-ink-muted">
              <th className="p-3 text-left font-medium">Adresse</th>
              <th className="p-3 text-left font-medium">Status</th>
              <th className="p-3 text-left font-medium">Quelle</th>
              <th className="p-3 text-left font-medium">Gruppe</th>
              <th className="p-3 text-left font-medium">Konto</th>
              <th className="p-3 text-left font-medium">Eingetragen am</th>
              <th className="p-3">
                <span className="sr-only">Aktion</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-bdas-soft hover:bg-bdas-surface-hover">
                <td className="p-3 text-bdas-ink">{r.email}</td>
                <td className="p-3">
                  <span className="rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-ink-body">
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="p-3 text-bdas-ink-body">{SOURCE_LABEL[r.source]}</td>
                <td className="p-3 text-bdas-ink-body">
                  {(r.userId === null ? undefined : groupNames[r.userId]) ?? "—"}
                </td>
                <td className="p-3 text-bdas-ink-body">{r.userId === null ? "—" : "Ja"}</td>
                <td className="p-3 text-bdas-ink-body">
                  {r.createdAt.toLocaleDateString("de-DE")}
                </td>
                <td className="p-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        `${r.email} endgültig löschen? Der Einwilligungsnachweis wird mitgelöscht, für echte Personen ist Abmelden der richtige Weg.`,
                        () => onRemove(r.id),
                        () => `${r.email} gelöscht.`,
                      )
                    }
                  >
                    Löschen
                  </Button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-bdas-ink-muted">
                  Keine Einträge.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
