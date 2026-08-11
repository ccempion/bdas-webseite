"use client";

import "@puckeditor/core/puck.css";

import { Puck, type Data } from "@puckeditor/core";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Alert } from "@bdas/design-system";

import { type Breite, normalizeContent, puckConfig } from "./puck-config";

/** Full-page Puck editor. Publish = save-is-live (spec §1): PUT the document,
 *  then return to the public page. */
export function PuckEditor({
  slug,
  initialData,
  defaultBreite = "schmal",
  chrome,
}: {
  slug: string;
  initialData: Data;
  defaultBreite?: Breite;
  /** Flag values the canvas chrome's footer needs. Read on the server by each
   *  /bearbeiten route — the canvas is a client tree and cannot read flags.
   *  Required, so a route that forgets it is a typecheck failure rather than a
   *  canvas footer with silently wrong links. */
  chrome: { events: boolean; groups: boolean };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const data = useMemo(
    () => normalizeContent(initialData, defaultBreite),
    [initialData, defaultBreite],
  );

  return (
    <div className="min-h-screen">
      {error ? (
        <Alert variant="error" className="m-4">
          {error}
        </Alert>
      ) : null}
      <Puck
        config={puckConfig}
        data={data}
        metadata={{ chrome }}
        headerTitle="BDAS Editor"
        headerPath={`/${slug}`}
        onPublish={async (data: Data) => {
          setError(null);
          const res = await fetch(`/api/content/pages/${slug}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ data }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            setError(body.error ?? "Speichern fehlgeschlagen.");
            return;
          }
          router.push(`/${slug}` as Route);
          router.refresh();
        }}
      />
    </div>
  );
}
