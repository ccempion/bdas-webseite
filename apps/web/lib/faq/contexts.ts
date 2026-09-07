/**
 * Stabile Schlüssel für „wo taucht dieser Eintrag als Kontext-Hilfe auf".
 * Das Modul speichert nur die Strings; welche gültig sind und welcher Route
 * sie entsprechen, bleibt Code (Spec §3). Ab PR 5 trägt jeder Eintrag die
 * Routen-Muster, über die das Hilfe-Panel den aktuellen Pfad auflöst.
 */
export type FaqContext = {
  readonly key: string;
  readonly label: string;
  readonly routes: readonly RegExp[];
};

export const FAQ_CONTEXTS: readonly FaqContext[] = [
  {
    key: "events.erstellen",
    label: "Event erstellen",
    routes: [/^\/admin\/events\/neu$/, /^\/admin\/events\/[^/]+\/edit$/],
  },
  {
    key: "dateien",
    label: "Dateien",
    routes: [/^\/dateien(\/|$)/, /^\/federal\/files(\/|$)/, /^\/gruppe\/[^/]+\/files(\/|$)/],
  },
  {
    key: "board.mitglieder",
    label: "Mitgliederverwaltung",
    routes: [/^\/federal\/members(\/|$)/, /^\/gruppe\/[^/]+\/members(\/|$)/],
  },
  {
    key: "board.gruppen",
    label: "Gruppenverwaltung",
    routes: [/^\/federal\/groups(\/|$)/, /^\/gruppe\/[^/]+\/profil(\/|$)/],
  },
  { key: "profil", label: "Profil", routes: [/^\/profil(\/|$)/, /^\/account(\/|$)/] },
];

/** The key whose patterns match this path, or null. First match wins. */
export function matchContext(pathname: string): string | null {
  return FAQ_CONTEXTS.find((c) => c.routes.some((re) => re.test(pathname)))?.key ?? null;
}

/**
 * Where the help launcher may appear at all. Spec §7 confines contextual help
 * to signed-in surfaces, and a Server Component cannot read the pathname — so
 * the route half of that gate lives here and runs on the client.
 *
 * `/gruppe/` keeps its trailing slash on purpose: `/gruppen` is the public
 * group directory and must not be caught by the board prefix.
 */
const SIGNED_IN_PREFIXES: readonly string[] = [
  "/account",
  "/admin",
  "/dashboard",
  "/dateien",
  "/faq",
  "/federal",
  "/gruppe/",
  "/profil",
];

export function isSignedInSurface(pathname: string): boolean {
  return SIGNED_IN_PREFIXES.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`),
  );
}
