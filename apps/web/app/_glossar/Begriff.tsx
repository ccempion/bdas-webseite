"use client";

import React, { useState, type ReactNode } from "react";

import { InfoPunkt } from "@bdas/design-system";

import { glossarEintrag } from "../../lib/glossar/eintraege";
import { useGlossarEnabled } from "./GlossarProvider";

// Per page load: a term's FAQ link is fetched once, however often it opens.
const linkCache = new Map<string, Promise<string | null>>();

function fetchMehrHref(key: string): Promise<string | null> {
  let pending = linkCache.get(key);
  if (!pending) {
    pending = fetch(`/api/glossar/${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ href: string | null }>) : { href: null }))
      .then((body) => body.href)
      .catch(() => null);
    linkCache.set(key, pending);
  }
  return pending;
}

/**
 * A term from the glossary, with its info point. Without the flag, or for a
 * key the glossary doesn't know, only the word is rendered — `glossar.test.ts`
 * fails the build on an unknown key instead.
 */
export function Begriff({ k, children }: { k: string; children?: ReactNode }) {
  const enabled = useGlossarEnabled();
  const eintrag = glossarEintrag(k);
  const [mehrHref, setMehrHref] = useState<string | null>(null);

  const word = children ?? eintrag?.begriff ?? k;
  if (!enabled || !eintrag) return <>{word}</>;

  return (
    <span className="whitespace-nowrap">
      {word}
      <InfoPunkt
        begriff={typeof children === "string" ? children : eintrag.begriff}
        mehrHref={mehrHref}
        onOpen={() => void fetchMehrHref(k).then(setMehrHref)}
      >
        {eintrag.text}
      </InfoPunkt>
    </span>
  );
}
