/**
 * Remembers, in this browser only, that someone already signed up (spec §6,
 * "Ruhe nach der Eintragung"). Server-side this would need a cookie, which
 * would be a consent question of its own for what is purely a display comfort.
 *
 * Every access is wrapped: private windows, cleared site data and browsers
 * that block storage all throw here, and none of that is worth a broken page.
 */
const KEY = "bdas-newsletter-signed-up";

export function markSignedUp(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable — the surface simply keeps offering itself */
  }
}

export function hasSignedUp(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
