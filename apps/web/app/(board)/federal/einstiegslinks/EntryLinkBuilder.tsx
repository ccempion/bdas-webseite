"use client";

import { useState } from "react";

import { Button, Card, Field, Input } from "@bdas/design-system";

import { buildEntryLink } from "../../../_onboarding/entry-link";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Kopiert" : "Kopieren"}
    </Button>
  );
}

export function EntryLinkBuilder({
  siteUrl,
  campaigns,
}: {
  siteUrl: string;
  campaigns: ReadonlyArray<{ slug: string; title: string }>;
}) {
  const [slug, setSlug] = useState("");
  const link = slug === "" ? null : buildEntryLink(siteUrl, slug);

  return (
    <div className="flex flex-col gap-6">
      <Card flat className="flex flex-col gap-4 p-6">
        <Field
          label="Kürzel der Kampagne"
          htmlFor="kampagne"
          hint="Kleinbuchstaben, Ziffern und Bindestriche, z. B. mensa-plakat-ws26. Das Kürzel landet bei jeder Registrierung über diesen Link in der Bewerbung."
          {...(slug !== "" && !link
            ? { error: "Nur a–z, 0–9 und Bindestrich, höchstens 64 Zeichen." }
            : {})}
        >
          <Input
            id="kampagne"
            value={slug}
            onChange={(e) => setSlug(e.currentTarget.value.trim())}
            autoComplete="off"
          />
        </Field>
        {link ? (
          <div className="flex flex-wrap items-center gap-3">
            <code className="break-all rounded-bdas-sm bg-bdas-overlay-faint px-2 py-1 text-sm text-bdas-ink">
              {link}
            </code>
            <CopyButton text={link} />
          </div>
        ) : null}
        <p className="text-sm text-bdas-ink-muted">
          Für einen QR-Code den Link in einen QR-Generator eurer Wahl geben.
        </p>
      </Card>

      {campaigns.length > 0 ? (
        <Card flat className="p-6">
          <h2 className="mb-3 font-semibold text-bdas-ink">Kampagnen mit eigener Begrüßung</h2>
          <ul className="flex flex-col gap-3">
            {campaigns.map((c) => {
              const url = buildEntryLink(siteUrl, c.slug);
              return url ? (
                <li key={c.slug} className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-bdas-ink">{c.title}</span>
                  <code className="break-all text-sm text-bdas-ink-body">{url}</code>
                  <CopyButton text={url} />
                </li>
              ) : null;
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
