"use client";

import "@puckeditor/core/puck.css";

import { Puck, type Data } from "@puckeditor/core";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@bdas/design-system";

import { puckConfig } from "./puck-config";

/** Full-page Puck editor. Publish = save-is-live (spec §1): PUT the document,
 *  then return to the public page. */
export function PuckEditor({ slug, initialData }: { slug: string; initialData: Data }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen">
      {error ? (
        <Alert variant="error" className="m-4">
          {error}
        </Alert>
      ) : null}
      <Puck
        config={puckConfig}
        data={initialData}
        headerTitle="Bundessprecher*innenrat"
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
