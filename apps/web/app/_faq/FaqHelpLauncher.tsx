"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import type { FaqHelpEntry } from "../api/faq/help/route";
import { SubmitQuestionDialog } from "../faq/SubmitQuestionDialog";
import { isSignedInSurface, matchContext } from "../../lib/faq/contexts";
import { pickByIds } from "../../lib/faq/help";
import { FaqHelpPanel } from "./FaqHelpPanel";

type Payload = {
  entries: FaqHelpEntry[];
  contextIds: string[];
  popularIds: string[];
};

/**
 * The route half of Spec §7's gate — a Server Component cannot read the
 * pathname, so the public/signed-in split happens here. Nothing is fetched
 * until the panel is opened ("kein Payload auf jeder Seite").
 */
export function FaqHelpLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payloads, setPayloads] = useState<Record<string, Payload>>({});
  const [submitOpen, setSubmitOpen] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState(false);

  const context = matchContext(pathname);
  // One cache entry per context key. The launcher is mounted in the root
  // layout, which the App Router does not remount on a client-side
  // navigation — a single slot would answer /profil with what it fetched for
  // /dateien, under the heading "Passend zu dieser Seite".
  const cacheKey = context ?? "";
  const payload = payloads[cacheKey] ?? null;

  // "Der Button erscheint nie vor leerem Panel" (Spec §7): the FAQ ships
  // seeded content, so the only way to an empty panel is a viewer with no
  // visible entries at all. That is discovered on the first open, and the
  // launcher then retires itself for the rest of this page session rather
  // than paying a probe request on every page. A failed request is not that
  // — it says nothing about the corpus — so it must never trip this branch.
  if (!isSignedInSurface(pathname) || empty) return null;

  async function openPanel() {
    setOpen(true);
    // A stale error must not outlive the request that caused it: the panel
    // renders `error` ahead of `loading`, so leaving it set would show the
    // failure text for the whole of the next — possibly fine — fetch.
    setError(false);
    if (payload) return;
    setLoading(true);
    try {
      const url = context
        ? `/api/faq/help?context=${encodeURIComponent(context)}`
        : "/api/faq/help";
      const res = await fetch(url);
      if (!res.ok) {
        setError(true);
        return;
      }
      const next = (await res.json()) as Payload;
      setPayloads((prev) => ({ ...prev, [cacheKey]: next }));
      if (next.entries.length === 0) {
        setOpen(false);
        setEmpty(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPanel()}
        aria-label="Hilfe öffnen"
        // z-40: the cookie notice is z-50 and must keep winning.
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-bdas-full bg-bdas-red text-lg font-bold text-bdas-surface shadow-bdas-card transition-colors duration-bdas-quick ease-bdas"
      >
        ?
      </button>
      {open && (
        <FaqHelpPanel
          open
          onClose={() => setOpen(false)}
          loading={loading}
          error={error}
          contextEntries={payload ? pickByIds(payload.entries, payload.contextIds) : []}
          popular={payload ? pickByIds(payload.entries, payload.popularIds) : []}
          allEntries={payload?.entries ?? []}
          onSubmitQuestion={() => {
            setOpen(false);
            setSubmitOpen(true);
          }}
        />
      )}
      {submitOpen && (
        <SubmitQuestionDialog
          open
          onClose={() => setSubmitOpen(false)}
          initialQuestion=""
          // Records the page the question came from (Spec §3).
          context={context}
        />
      )}
    </>
  );
}
