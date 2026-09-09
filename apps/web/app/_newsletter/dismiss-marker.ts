/**
 * Remembers, for this browser session only, that a guest clicked the scroll
 * panel away. §6.1 asks for exactly that shape — gone for this visit, back on
 * the next one — which is why this is `sessionStorage` and not the
 * `localStorage` its neighbour `signup-marker.ts` uses. That one remembers
 * something else and something permanent: that a signup actually happened.
 *
 * An account gets no marker here. Its "Später" is server-side (`declineForUser`)
 * so the fortnight of quiet follows the person across their devices, and so
 * §25 TDDDG never applies in the first place.
 *
 * Every access is wrapped: private windows, cleared site data and browsers that
 * block storage all throw here, and none of that is worth a broken page.
 */
const KEY = "bdas-newsletter-panel-dismissed";

export function markDismissed(): void {
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable — the panel simply reappears on the next page */
  }
}

export function hasDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
