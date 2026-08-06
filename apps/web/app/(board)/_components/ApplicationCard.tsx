"use client";

import { useState, useTransition } from "react";

import { Button, Card } from "@bdas/design-system";
import type { RejectionCategory } from "@bdas/members";

import { acceptApplicationAction, rejectApplicationAction } from "./application-actions";
import { RejectDialog } from "./RejectDialog";

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString("de-DE") : "—");

export function ApplicationCard({
  requestId,
  slug,
  canDecide,
  name,
  isExistingMember,
  requestedAt,
  photoUrl,
  profile,
  priorRejections,
  categories,
}: {
  requestId: string;
  slug: string;
  canDecide: boolean;
  name: string;
  isExistingMember: boolean;
  requestedAt: Date;
  photoUrl: string | null;
  profile: {
    uni: string;
    studiengang: string;
    abschlussart: string;
    geburtsdatum: string;
    gefundenDurch: string;
    empfehlerName: string | null;
    vorstellung: string | null;
  } | null;
  priorRejections: ReadonlyArray<{ decidedAt: Date | null; categoryLabel: string }>;
  categories: ReadonlyArray<{ key: RejectionCategory; label: string }>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const accept = () => {
    setError(null);
    start(async () => {
      const res = await acceptApplicationAction(requestId, slug);
      if (!res.ok) setError(res.error ?? "Fehler");
    });
  };

  return (
    <Card className="p-5">
      <div className="flex gap-4">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={`Profilbild von ${name}`}
            className="h-16 w-16 flex-none rounded-bdas-sm object-cover"
          />
        ) : (
          <div className="h-16 w-16 flex-none rounded-bdas-sm bg-bdas-surface-hover" />
        )}

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-bdas-ink">
            {name}
            {isExistingMember ? (
              <span className="ml-2 rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-ink-body">
                Mitglied ohne Gruppe
              </span>
            ) : null}
          </h2>

          {profile ? (
            <>
              <p className="mt-1 text-sm text-bdas-ink-body">
                {profile.uni} · {profile.studiengang}, {profile.abschlussart}
                <br />
                geb. {new Date(profile.geburtsdatum).toLocaleDateString("de-DE")}
                <br />
                Gefunden durch: {profile.gefundenDurch}
                {profile.empfehlerName ? ` — empfohlen von ${profile.empfehlerName}` : ""}
              </p>
              {/* Optional and unverified (#122) — the applicant's own words, so
                  it is quoted rather than folded into the facts above. */}
              {profile.vorstellung ? (
                <blockquote className="mt-2 border-l-2 border-bdas-soft pl-3 text-sm italic text-bdas-ink-body">
                  {profile.vorstellung}
                </blockquote>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-sm text-bdas-ink-muted">Kein erweitertes Profil hinterlegt.</p>
          )}

          <p className="mt-1 text-sm text-bdas-ink-muted">Beworben am {fmt(requestedAt)}</p>

          {priorRejections.length > 0 ? (
            <p className="mt-2 rounded-bdas-sm bg-bdas-surface-hover px-2 py-1 text-sm text-bdas-red">
              {priorRejections.length + 1}. Bewerbung — zuletzt abgelehnt am{" "}
              {fmt(priorRejections[0]!.decidedAt)} ({priorRejections[0]!.categoryLabel})
            </p>
          ) : null}

          {error ? <p className="mt-2 text-sm text-bdas-red">{error}</p> : null}

          {canDecide ? (
            <div className="mt-3 flex gap-2">
              <Button onClick={accept} disabled={pending || rejecting}>
                {pending ? "Wird gespeichert …" : "Aufnehmen"}
              </Button>
              <Button variant="secondary" onClick={() => setRejecting(true)} disabled={pending}>
                Ablehnen …
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-bdas-ink-muted">
              Über diese Bewerbung entscheidet der lokale Vorstand.
            </p>
          )}
        </div>
      </div>

      {rejecting ? (
        <RejectDialog
          requestId={requestId}
          name={name}
          categories={categories}
          onSubmit={(reason) => rejectApplicationAction(requestId, slug, reason)}
          onClose={() => setRejecting(false)}
        />
      ) : null}
    </Card>
  );
}
