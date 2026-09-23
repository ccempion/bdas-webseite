import { rowsToCsv, type Row } from "./csv";
import { buildZip } from "./zip";

declare const PRINCIPAL: unique symbol;

/** Structural subset of `CurrentMember` (`@bdas/members`); a real `CurrentMember` satisfies it. */
export type SessionIdentity = {
  readonly user: { readonly id: string };
  readonly member: { readonly id: string } | null;
};

/** Branded: only `principalFrom` can produce one, a hand-built literal does not typecheck. */
export type Principal = {
  readonly userId: string;
  readonly memberId: string | null;
  readonly [PRINCIPAL]: true;
};

export function principalFrom(me: SessionIdentity): Principal {
  return { userId: me.user.id, memberId: me.member?.id ?? null } as Principal;
}

export type Category = {
  readonly file: string;
  readonly columns: readonly string[];
  readonly rows: readonly Row[];
};

export type Readers = {
  readonly enabled: (flag: string) => boolean;
  readonly account: (userId: string) => Promise<Row | null>;
  readonly sessions: (userId: string) => Promise<readonly Row[]>;
  readonly member: (userId: string) => Promise<{
    member: Row | null;
    roleGrants: readonly Row[];
    groupChangeRequests: readonly Row[];
  }>;
  readonly profile: (userId: string) => Promise<Row | null>;
  readonly participation: (
    memberId: string,
  ) => Promise<{ registrations: readonly Row[]; attendance: readonly Row[] }>;
  readonly organizedEvents: (userId: string) => Promise<readonly Row[]>;
  readonly files: (userId: string) => Promise<readonly Row[]>;
  readonly blog: (userId: string) => Promise<{ posts: readonly Row[]; comments: readonly Row[] }>;
  readonly notifications: (userId: string) => Promise<readonly Row[]>;
};

export type DataExport = {
  readonly exportedAt: string;
  readonly categories: readonly Category[];
  readonly skipped: readonly { readonly category: string; readonly reason: string }[];
};

type Spec = {
  readonly key: string;
  readonly file: string;
  readonly flag: string | null;
  readonly columns: readonly string[];
};

const SPECS = {
  konto: {
    key: "konto",
    file: "konto.csv",
    flag: null,
    columns: ["id", "email", "status", "consentAt", "consentVersion", "createdAt", "updatedAt"],
  },
  sitzungen: {
    key: "sitzungen",
    file: "sitzungen.csv",
    flag: null,
    columns: ["createdAt", "expiresAt", "revokedAt", "ip", "userAgent"],
  },
  mitgliedschaft: {
    key: "mitgliedschaft",
    file: "mitgliedschaft.csv",
    flag: null,
    columns: [
      "id",
      "firstName",
      "lastName",
      "primaryGroupId",
      "status",
      "joinedAt",
      "createdAt",
      "updatedAt",
    ],
  },
  rollen: {
    key: "rollen",
    file: "rollen.csv",
    flag: null,
    columns: ["role", "groupId", "grantedAt", "revokedAt"],
  },
  gruppenwechsel: {
    key: "gruppenwechsel",
    file: "gruppenwechsel.csv",
    flag: null,
    columns: [
      "id",
      "fromGroupId",
      "toGroupId",
      "status",
      "requestedAt",
      "decidedAt",
      "reasonCategory",
      "reasonMessage",
    ],
  },
  profil: {
    key: "profil",
    file: "profil.csv",
    flag: "profile",
    columns: [
      "userId",
      "nutzertyp",
      "studiengang",
      "studienfachKategorie",
      "abschlussart",
      "uni",
      "geburtsdatum",
      "interesse",
      "bdajFunktion",
      "gefundenDurch",
      "empfehlerName",
      "vorstellung",
      "photoStorageKey",
      "completedAt",
      "updatedAt",
    ],
  },
  anmeldungen: {
    key: "veranstaltungen",
    file: "veranstaltungen_anmeldungen.csv",
    flag: "events",
    columns: [
      "registrationId",
      "eventId",
      "eventTitle",
      "eventStartsAt",
      "registeredAt",
      "cancelledAt",
      "waitlistPosition",
    ],
  },
  organisiert: {
    key: "veranstaltungen",
    file: "veranstaltungen_organisiert.csv",
    flag: "events",
    columns: [
      "id",
      "groupId",
      "title",
      "descriptionMd",
      "startsAt",
      "endsAt",
      "location",
      "locationUrl",
      "content",
      "summary",
      "registrationDeadline",
      "locationName",
      "locationAddress",
      "locationLat",
      "locationLng",
      "capacity",
      "allowGuestRegistration",
      "visibility",
      "status",
      "createdBy",
    ],
  },
  anwesenheit: {
    key: "veranstaltungen",
    file: "veranstaltungen_anwesenheit.csv",
    flag: "events",
    columns: ["eventId", "eventTitle", "eventStartsAt", "attended", "checkedInAt"],
  },
  dateien: {
    key: "dateien",
    file: "dateien.csv",
    flag: "files",
    columns: ["id", "folderId", "filename", "mimeType", "sizeBytes", "status", "uploadedAt"],
  },
  beitraege: {
    key: "blog",
    file: "blog_beitraege.csv",
    flag: "blog",
    columns: [
      "id",
      "slug",
      "title",
      "content",
      "visibility",
      "category",
      "createdBy",
      "createdAt",
      "updatedAt",
    ],
  },
  kommentare: {
    key: "blog",
    file: "blog_kommentare.csv",
    flag: "blog",
    columns: ["id", "postId", "authorId", "body", "createdAt"],
  },
  benachrichtigungen: {
    key: "benachrichtigungen",
    file: "benachrichtigungen.csv",
    flag: "notifications",
    columns: ["id", "channel", "template", "toEmail", "subject", "status", "error", "createdAt"],
  },
} as const satisfies Record<string, Spec>;

export async function buildDataExport(
  r: Readers,
  p: Principal,
  now: Date = new Date(),
): Promise<DataExport> {
  const skipped: { category: string; reason: string }[] = [];
  const on = (s: Spec): boolean => {
    if (s.flag !== null && !r.enabled(s.flag)) {
      if (!skipped.some((x) => x.category === s.key)) {
        skipped.push({ category: s.key, reason: "Modul nicht aktiv" });
      }
      return false;
    }
    return true;
  };
  const cat = (s: Spec, rows: readonly Row[]): Category => ({
    file: s.file,
    columns: s.columns,
    rows: rows.map((r): Row => Object.fromEntries(s.columns.map((k) => [k, r[k]]))),
  });
  const categories: Category[] = [];

  const [account, sessions, member] = await Promise.all([
    r.account(p.userId),
    r.sessions(p.userId),
    r.member(p.userId),
  ]);
  categories.push(cat(SPECS.konto, account ? [account] : []));
  categories.push(cat(SPECS.sitzungen, sessions));
  categories.push(cat(SPECS.mitgliedschaft, member.member ? [member.member] : []));
  categories.push(cat(SPECS.rollen, member.roleGrants));
  categories.push(cat(SPECS.gruppenwechsel, member.groupChangeRequests));

  if (on(SPECS.profil)) {
    const profile = await r.profile(p.userId);
    categories.push(cat(SPECS.profil, profile ? [profile] : []));
  }
  if (on(SPECS.anmeldungen)) {
    categories.push(cat(SPECS.organisiert, await r.organizedEvents(p.userId)));
    if (p.memberId === null) {
      skipped.push({ category: "veranstaltungen", reason: "Kein Mitgliedseintrag" });
    } else {
      const part = await r.participation(p.memberId);
      categories.push(cat(SPECS.anmeldungen, part.registrations));
      categories.push(cat(SPECS.anwesenheit, part.attendance));
    }
  }
  if (on(SPECS.dateien)) categories.push(cat(SPECS.dateien, await r.files(p.userId)));
  if (on(SPECS.beitraege)) {
    const b = await r.blog(p.userId);
    categories.push(cat(SPECS.beitraege, b.posts));
    categories.push(cat(SPECS.kommentare, b.comments));
  }
  if (on(SPECS.benachrichtigungen)) {
    categories.push(cat(SPECS.benachrichtigungen, await r.notifications(p.userId)));
  }

  return { exportedAt: now.toISOString(), categories, skipped };
}

export function toJson(e: DataExport): string {
  return JSON.stringify(e, null, 2);
}

function readme(e: DataExport): string {
  const skipped = e.skipped.map((s) => `- ${s.category}: ${s.reason}`).join("\n") || "- keine";
  return [
    "BDAS-Datenauskunft (Art. 15 DSGVO)",
    `Erstellt am: ${e.exportedAt}`,
    "",
    "Übersprungene Kategorien:",
    skipped,
    "",
    "Bewusst nicht enthalten:",
    "- Gast-Anmeldungen zu Veranstaltungen (an eine E-Mail-Adresse, nicht an dein Konto gebunden)",
    "- Dateiinhalte (nur Metadaten; die Dateien selbst kannst du im Dateibereich herunterladen)",
    "- Kennungen anderer Personen (z. B. wer eine Rolle vergeben oder einen Antrag entschieden hat)",
    "",
  ].join("\r\n");
}

export function toZip(e: DataExport): Uint8Array {
  return buildZip([
    ...e.categories.map((c) => ({ name: c.file, content: rowsToCsv(c.columns, c.rows) })),
    { name: "LIESMICH.txt", content: readme(e) },
  ]);
}
