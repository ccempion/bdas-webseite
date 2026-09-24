"use client";

import React, { type ReactNode } from "react";

import { Begriff } from "./Begriff";

/**
 * Plain text from data (onboarding outcomes, status labels) with info points
 * on the listed words. `begriffe` maps the exact word in the text to its
 * glossary key; each key is marked once, at its first occurrence, and a
 * longer word wins over a shorter one it contains ("Bundesvorstand" over
 * "Vorstand"). Words not in the text are simply skipped.
 *
 * Several texts on one screen share `seen` so a term gets one info point per
 * screen, not one per paragraph (Spec §6 rule 1). Render order is document
 * order, so the first paragraph wins.
 */
export function BegriffText({
  text,
  begriffe,
  seen,
}: {
  text: string;
  begriffe: Readonly<Record<string, string>>;
  seen?: Set<string>;
}) {
  return <>{markBegriffe(text, begriffe, seen)}</>;
}

export function markBegriffe(
  text: string,
  begriffe: Readonly<Record<string, string>>,
  seen: Set<string> = new Set(),
): ReactNode[] {
  const words = Object.keys(begriffe).sort((a, b) => b.length - a.length);
  if (words.length === 0) return [text];
  const pattern = new RegExp(words.map(escapeRegExp).join("|"), "g");

  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const word = match[0];
    const key = begriffe[word];
    const at = match.index ?? 0;
    if (!key || seen.has(key) || !isWordBoundary(text, at, word.length)) continue;
    seen.add(key);
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <Begriff key={`${key}-${at}`} k={key}>
        {word}
      </Begriff>,
    );
    last = at + word.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function isWordBoundary(text: string, at: number, length: number): boolean {
  const letter = /[\p{L}\p{N}]/u;
  const before = at > 0 ? text[at - 1] : "";
  const after = text[at + length] ?? "";
  return !letter.test(before ?? "") && !letter.test(after);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
