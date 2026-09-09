import React from "react";

import { getDb } from "@bdas/db";

import { loadViewer } from "../_dashboard/session";
import { NewsletterScrollPanel } from "./NewsletterScrollPanel";
import { readScrollPanelState } from "./viewer-state";

/**
 * The server half of D2's gate, in the shape `FaqHelpMount` already uses: an
 * async component inside the sync root layout.
 *
 * `loadViewer` is `cache()`d per request and the header resolves the session
 * anyway, so a signed-in visitor costs one subscription read and a signed-out
 * one costs nothing at all. Deciding here rather than in the browser is the
 * point: a subscriber must never see the panel flash up before the answer
 * arrives (spec §6.1).
 */
export async function NewsletterScrollPanelMount() {
  const state = await readScrollPanelState(getDb(), await loadViewer());
  if (state === null) return null;
  return <NewsletterScrollPanel state={state} />;
}
