/**
 * Eine angemeldete Sitzung, ohne den Browser durch Registrierung, Bestätigung
 * und Anmeldemaske zu schicken.
 *
 * Der Anmeldeweg ist nur in wenigen Specs der Prüfgegenstand (auth,
 * onboarding-*, resend-verification, password-change); überall sonst ist er
 * reiner Aufbau und kostete vier Seitenwechsel und drei Server-Aktionen, bevor
 * der Test überhaupt anfing. Die Sitzungsschicht ist handgeschrieben
 * (ADR 0003: Drizzle + argon2 + jose/HS256), also lässt sich derselbe
 * Endzustand direkt herstellen: Konto, Zugangsdaten und Mitgliedszeile in die
 * Datenbank, eine Sitzungszeile dazu, und dasselbe JWT-Cookie in den Browser
 * legen, das die Anmeldung gesetzt hätte.
 *
 * WARUM NICHT `storageState` (einmal pro Rolle im globalSetup erzeugt und von
 * allen Tests wiederverwendet): das teilt die Konten zwischen den Specs. Die
 * Suite ist aber darauf gebaut, dass jeder Test sein eigenes `uniqueEmail`
 * mitbringt und nur prüft, was er selbst angelegt hat — geteilte Konten tauchen
 * gegenseitig in Bewerbungslisten, Freigabe-Zählern, FAQ-Stimmen und im Pool
 * auf, und die halbe Suite verändert ihren Nutzer unterwegs (aufnehmen, Gruppe
 * wechseln, Rollen vergeben, Konto löschen). Der Gewinn wären ein paar
 * Millisekunden pro Test, der Preis genau die Isolation, die den Lauf
 * deterministisch hält. Also pro Test geseedet, nicht pro Rolle geteilt.
 *
 * Fallstricke:
 *  - Der Helfer navigiert nicht. Wer bisher auf `createProfile()` gebaut hat
 *    (das auf /account endete), braucht danach ein eigenes `page.goto`.
 *  - Das Passwort funktioniert wirklich: ein Test darf hinterher abmelden und
 *    durch die echte Anmeldemaske zurückkommen.
 *  - Es entstehen keine Ereignisse. Registrierung und Bestätigung
 *    veröffentlichen `auth.user.registered` / `auth.user.verified`; was daran
 *    hängt (Newsletter aus der Registrierung, Ordner-Provisionierung) gibt es
 *    hier nicht. Specs über genau diese Kopplung bleiben beim echten Weg.
 */
import { hash } from "@node-rs/argon2";
import { test, type Page } from "@playwright/test";
import { SignJWT } from "jose";

import { COOKIE_MAX_AGE_SECONDS, COOKIE_NAME, TOKEN_VERSION } from "@bdas/auth";

import { insertSessionRow, seedAccount } from "./db";
import { PASSWORD } from "./flows";

/**
 * Cookie-Name, Laufzeit und Token-Version kommen aus dem Auth-Modul selbst,
 * nicht als abgeschriebene Literale.
 *
 * Die Helfer hielten das Auth-Modul bisher bewusst draußen, damit die
 * Playwright-Seite nicht argon2 und jose mitladen muss. Dieses Modul braucht
 * beide ohnehin, um Passwort und Token herzustellen — der Import kostet hier
 * also nichts mehr, und dafür kann keiner der drei Werte unbemerkt vom echten
 * Anmeldeweg abdriften. Alle drei stehen in `index.ts`, sind also öffentliche
 * Fläche (CLAUDE.md §1 Regel 8) und kein Tiefenimport.
 */

/** Dieselben Argon2id-Parameter wie `modules/auth/src/password.ts`. argon2
 *  liest m/t/p beim Prüfen aus dem kodierten Hash zurück, ein Auseinanderlaufen
 *  kostet also Rechenzeit, nicht Richtigkeit. */
const ARGON2 = { memoryCost: 19_456, timeCost: 2, outputLen: 32, parallelism: 1 } as const;

/**
 * Die einzige Rolle, die wirklich im Token steht: `login()` vergibt sie, wenn
 * die Adresse in BDAS_FEDERAL_BOARD_EMAILS steht (login.ts). Alle anderen
 * Rollen liest die App bei jedem Aufruf aus `member_role_grants` — die gehören
 * in `seedRoleGrant`/`grantLocalBoardLead`, nicht hierher.
 */
export type JwtRole = "federal_board";

export type SeededUser = {
  readonly email: string;
  readonly userId: string;
  readonly memberId: string;
  readonly password: string;
  readonly roles: ReadonlyArray<JwtRole>;
};

export type SeedSessionOptions = {
  readonly email: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly password?: string;
  /** `members.status`. Die Registrierung hinterlässt `pending`; `active` ist,
   *  was eine Aufnahme durch den Vorstand daraus macht. */
  readonly status?: "pending" | "active";
  /** `members.primary_group_id` — der Zustand NACH einer Aufnahme. Für die
   *  offene Bewerbung stattdessen `application` verwenden. */
  readonly groupId?: string;
  /** Die offene Bewerbung, die das Profilformular anlegt (ADR 0022): ein
   *  Antrag NULL → Gruppe, während `primary_group_id` leer bleibt. */
  readonly application?: string;
  readonly roles?: ReadonlyArray<JwtRole>;
};

/** argon2 kostet ~50 ms, und alle geseedeten Konten teilen sich ein Passwort —
 *  also einmal pro Worker rechnen, nicht einmal pro Konto. */
const hashes = new Map<string, Promise<string>>();
function hashPassword(plain: string): Promise<string> {
  let pending = hashes.get(plain);
  if (!pending) {
    pending = hash(plain, ARGON2);
    hashes.set(plain, pending);
  }
  return pending;
}

function signingKey(): Uint8Array {
  const secret = process.env["SSO_JWT_SECRET"] ?? "";
  if (secret.length < 32) {
    throw new Error(
      "seedSession braucht dasselbe SSO_JWT_SECRET wie die laufende App " +
        "(mindestens 32 Zeichen). Lokal steht es in apps/web/.env.local und muss " +
        "auch im Playwright-Prozess gesetzt sein, sonst scheitert jede geseedete " +
        "Anmeldung still.",
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Der Ursprung, auf den das Cookie gehört. `page` trägt die baseURL nicht, das
 * laufende Projekt aber schon; der Rückfall deckt den Fall ab, dass Playwright
 * sie auf Projektebene nicht auflöst.
 */
function baseUrl(): string {
  return (
    test.info().project.use.baseURL ?? process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000"
  );
}

/** Ein fertiges Konto in der Datenbank — ohne Browser, ohne Sitzung. */
export async function seedUser(opts: SeedSessionOptions): Promise<SeededUser> {
  const password = opts.password ?? PASSWORD;
  const { userId, memberId } = await seedAccount({
    email: opts.email,
    firstName: opts.firstName ?? "Test",
    lastName: opts.lastName ?? "Nutzer",
    hashedPassword: await hashPassword(password),
    memberStatus: opts.status ?? "pending",
    primaryGroupId: opts.groupId ?? null,
    applicationGroupId: opts.application ?? null,
  });
  return {
    email: opts.email,
    userId,
    memberId,
    password,
    roles: opts.roles ?? [],
  };
}

/**
 * Eine frische Sitzung für ein bereits geseedetes Konto.
 *
 * Jeder Aufruf legt eine neue Sitzungszeile an. Ein wiederverwendetes Token
 * wäre nach einem `logout()` wertlos — das widerruft die Zeile serverseitig,
 * und `getCurrentUser` prüft sie bei jedem Aufruf.
 */
export async function signIn(page: Page, user: SeededUser): Promise<void> {
  const sessionId = await insertSessionRow(user.userId, COOKIE_MAX_AGE_SECONDS);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    email: user.email.trim().toLowerCase(),
    roles: user.roles,
    ver: TOKEN_VERSION,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("bdas")
    .setSubject(user.userId)
    .setJti(sessionId)
    .setIssuedAt(now)
    .setExpirationTime(now + COOKIE_MAX_AGE_SECONDS)
    .sign(signingKey());

  await page.context().addCookies([
    {
      name: COOKIE_NAME,
      value: jwt,
      url: baseUrl(),
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** Konto anlegen und anmelden, in einem Zug. Der Ersatz für
 *  `registerVerifyLogin` überall dort, wo der Anmeldeweg nur Aufbau ist. */
export async function seedSession(page: Page, opts: SeedSessionOptions): Promise<SeededUser> {
  const user = await seedUser(opts);
  await signIn(page, user);
  return user;
}

/**
 * Die Sitzung im Browser beenden, ohne die Abmelde-Fläche zu bedienen.
 *
 * Um auf das nächste Konto zu wechseln ist `logout()` aus `flows.ts` das
 * falsche Werkzeug: es klickt den Knopf im Seitenkopf, braucht also eine
 * geladene Seite — und nach `seedSession` steht der Browser oft noch auf
 * about:blank, weil der Helfer bewusst nicht navigiert. Es braucht außerdem
 * den mobilen Viewport, auf dem die Hamburger-Klappe überhaupt existiert. Das
 * Cookie fallen zu lassen ist von beidem unabhängig; die Abmelde-Fläche selbst
 * prüft auth.e2e.ts.
 *
 * Die Sitzungszeile bleibt serverseitig offen. Das ist unerheblich: `signIn`
 * stellt für jede Rückkehr ohnehin eine neue aus.
 */
export async function endSession(page: Page): Promise<void> {
  await page.context().clearCookies();
}
