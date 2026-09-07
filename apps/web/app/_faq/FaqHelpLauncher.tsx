"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import type { FaqHelpEntry } from "../api/faq/help/route";
import { SubmitQuestionDialog } from "../faq/SubmitQuestionDialog";
import { isSignedInSurface, matchContext } from "../../lib/faq/contexts";
import { FaqHelpPanel } from "./FaqHelpPanel";

type Payload = {
  contextEntries: FaqHelpEntry[];
  allEntries: FaqHelpEntry[];
  popular: FaqHelpEntry[];
};

const EMPTY: Payload = { contextEntries: [], allEntries: [], popular: [] };

/**
 * The route half of Spec §7's gate — a Server Component cannot read the
 * pathname, so the public/signed-in split happens here. Nothing is fetched
 * until the panel is opened ("kein Payload auf jeder Seite").
 */
export function FaqHelpLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [empty, setEmpty] = useState(false);

  const context = matchContext(pathname);

  // "Der Button erscheint nie vor leerem Panel" (Spec §7): the FAQ ships
  // seeded content, so the only way to an empty panel is a viewer with no
  // visible entries at all. That is discovered on the first open, and the
  // launcher then retires itself for the rest of this page session rather
  // than paying a probe request on every page.
  if (!isSignedInSurface(pathname) || empty) return null;

  async function openPanel() {
    setOpen(true);
    if (payload) return;
    setLoading(true);
    try {
      const url = context
        ? `/api/faq/help?context=${encodeURIComponent(context)}`
        : "/api/faq/help";
      const res = await fetch(url);
      const next: Payload = res.ok ? ((await res.json()) as Payload) : EMPTY;
      setPayload(next);
      if (next.allEntries.length === 0) {
        setOpen(false);
        setEmpty(true);
      }
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
          contextEntries={payload?.contextEntries ?? []}
          popular={payload?.popular ?? []}
          allEntries={payload?.allEntries ?? []}
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
