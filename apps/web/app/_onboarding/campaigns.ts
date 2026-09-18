export type Campaign = { readonly title: string; readonly greeting: string };

/**
 * Bekannte Kampagnen, Schlüssel = Slug in `?from=kampagne:<slug>` (Kleinbuchstaben,
 * Ziffern, Bindestrich). Welche Kampagnen es gibt und wie sie begrüßen,
 * entscheidet der Bundesvorstand; eine neue Kampagne ist eine Zeile hier.
 * Ein Link mit unbekanntem Slug funktioniert trotzdem: die Herkunft wird
 * gespeichert, die Begrüßung ist die Standard-Begrüßung.
 */
export const CAMPAIGNS: Readonly<Record<string, Campaign>> = {};
