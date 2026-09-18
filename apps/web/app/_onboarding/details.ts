import {
  ABSCHLUSSART_OPTIONS,
  BDAJ_FUNKTION_OPTIONS,
  FIELD_SETS,
  GEFUNDEN_DURCH_OPTIONS,
  PROFILE_FIELD_SCHEMAS,
  type Nutzertyp,
  type ProfileField,
} from "@bdas/profile";

import { resolveUni, type WizardValues } from "../_profile/steps";

/** Die Werte von Teil 3 — die Felder des alten Wizards plus die neuen. Alles
 *  Zeichenketten, damit die bestehenden Feld-Bausteine sie direkt binden. */
export type DetailValues = WizardValues & {
  studienfachKategorie: string;
  /** Freitext, wenn im Fach „Sonstige" gewählt ist. */
  studiengangOther: string;
  interesse: string;
  bdajFunktion: string;
};

export const EMPTY_DETAILS: DetailValues = {
  studiengang: "",
  abschlussart: "",
  uni: "",
  uniOther: "",
  primaryGroupId: "",
  geburtsdatum: "",
  gefundenDurch: "",
  empfehlerName: "",
  vorstellung: "",
  photoStorageKey: null,
  studienfachKategorie: "",
  studiengangOther: "",
  interesse: "",
  bdajFunktion: "",
};

export type DetailScreen = {
  readonly id: ProfileField;
  readonly fields: ReadonlyArray<ProfileField>;
  readonly title: string;
  readonly why: string;
};

/** Jedes Feld sagt in einem Satz, warum wir fragen (Spec §2 Punkt 4). */
function copy(t: Nutzertyp, field: ProfileField): { title: string; why: string } {
  const past = t === "alumnus";
  switch (field) {
    case "studienfach":
      return {
        title: past ? "Was hast du studiert?" : "Was studierst du?",
        why: "Erst der Bereich, dann das Fach — so finden dich Leute aus deiner Richtung.",
      };
    case "abschlussart":
      return { title: "Welcher Abschluss?", why: "Hilft deinem Vorstand, dich einzuordnen." };
    case "uni":
      return past
        ? {
            title: "An welcher Hochschule warst du?",
            why: "So finden dich Ehemalige derselben Hochschule.",
          }
        : { title: "An welcher Hochschule?", why: "Dein Vorstand sieht so, wo du studierst." };
    case "geburtsdatum":
      return {
        title: "Wann hast du Geburtstag?",
        why: "Sieht nur der Vorstand, der über deine Bewerbung entscheidet.",
      };
    case "gefundenDurch":
      return {
        title: "Wie hast du uns gefunden?",
        why: "Hilft uns zu verstehen, wie Leute zu BDAS finden.",
      };
    case "photo":
      return {
        title: "Magst du ein Foto hochladen?",
        why: "Freiwillig — so erkennt dich dein Vorstand beim ersten Treffen.",
      };
    case "interesse":
      return {
        title: "Was interessiert dich an BDAS?",
        why: "Ein, zwei Sätze reichen. Der Bundesvorstand liest mit.",
      };
    case "bdajFunktion":
      return {
        title: "Welche Funktion hast du in der BDAJ?",
        why: "So weiß der Bundesvorstand, welche Zugänge du brauchst.",
      };
  }
}

/** Ein Thema pro Bildschirm; der Abschluss gehört zum Studienfach (Spec §4.3). */
export function detailScreens(t: Nutzertyp): DetailScreen[] {
  const screens: DetailScreen[] = [];
  for (const field of FIELD_SETS[t]) {
    const prev = screens[screens.length - 1];
    if (field === "abschlussart" && prev?.id === "studienfach") {
      screens[screens.length - 1] = { ...prev, fields: [...prev.fields, field] };
      continue;
    }
    screens.push({ id: field, fields: [field], ...copy(t, field) });
  }
  return screens;
}

/** Auswahlwert für „Mein Fach fehlt …". Nicht `SONSTIGE`: die Kategorie
 *  „Sonstige" enthält ein gleichnamiges Fach, das wählbar bleiben muss. */
export const FACH_FEHLT = "__fach_fehlt__";

export function resolveStudiengang(v: DetailValues): string {
  return v.studiengang === FACH_FEHLT ? v.studiengangOther.trim() : v.studiengang;
}

const orNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

export function toProfileFields(t: Nutzertyp, v: DetailValues): Record<string, unknown> {
  const common = {
    nutzertyp: t,
    gefundenDurch: v.gefundenDurch,
    empfehlerName: orNull(v.empfehlerName),
    vorstellung: orNull(v.vorstellung),
    photoStorageKey: v.photoStorageKey,
  };
  switch (t) {
    case "student":
      return {
        ...common,
        studienfachKategorie: orNull(v.studienfachKategorie),
        studiengang: resolveStudiengang(v),
        abschlussart: v.abschlussart,
        uni: resolveUni(v),
        geburtsdatum: v.geburtsdatum,
      };
    case "alumnus":
      return {
        ...common,
        studienfachKategorie: orNull(v.studienfachKategorie),
        studiengang: resolveStudiengang(v),
        uni: resolveUni(v),
      };
    case "foerderer":
      return { ...common, interesse: v.interesse };
    case "bdaj":
      return { ...common, bdajFunktion: v.bdajFunktion };
  }
}

const SCHEMA_KEYS: Record<ProfileField, ReadonlyArray<string>> = {
  studienfach: ["studienfachKategorie", "studiengang"],
  abschlussart: ["abschlussart"],
  uni: ["uni"],
  geburtsdatum: ["geburtsdatum"],
  gefundenDurch: ["gefundenDurch", "empfehlerName", "vorstellung"],
  photo: ["photoStorageKey"],
  interesse: ["interesse"],
  bdajFunktion: ["bdajFunktion"],
};

/** Prüft nur die Felder dieses Bildschirms — mit dem Schema des Moduls als einziger Wahrheit. */
export function validateDetailScreen(
  t: Nutzertyp,
  screen: DetailScreen,
  v: DetailValues,
): Record<string, string> {
  const owned = new Set(screen.fields.flatMap((f) => SCHEMA_KEYS[f]));
  const errors: Record<string, string> = {};

  // Im Schema optional (das Konto-Formular kennt sie nicht), im Wizard Pflicht.
  if (owned.has("studienfachKategorie") && v.studienfachKategorie.trim() === "") {
    errors["studienfachKategorie"] = "Bitte wähle einen Studienbereich.";
  }

  const res = PROFILE_FIELD_SCHEMAS[t].safeParse(toProfileFields(t, v));
  if (!res.success) {
    for (const issue of res.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (owned.has(key) && !errors[key]) errors[key] = issue.message;
    }
  }
  return errors;
}

const STRING_KEYS = Object.keys(EMPTY_DETAILS).filter((k) => k !== "photoStorageKey") as Array<
  Exclude<keyof DetailValues, "photoStorageKey">
>;

/** Zwischenstand aus der Journey — nur bekannte Textfelder (Spec §5.3). */
export function restoreDetails(raw: unknown): DetailValues {
  const out: DetailValues = { ...EMPTY_DETAILS };
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  for (const key of STRING_KEYS) {
    const value = r[key];
    if (typeof value === "string" && value.length <= 1000) out[key] = value;
  }
  if (typeof r["photoStorageKey"] === "string") out.photoStorageKey = r["photoStorageKey"];
  return out;
}

const label = (options: ReadonlyArray<{ value: string; label: string }>, key: string): string =>
  options.find((o) => o.value === key)?.label ?? key;

function germanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Die Zeilen eines Blocks auf dem Zusammenfassungs-Bildschirm (Spec §4.3 Punkt 8). */
export function summaryLines(screen: DetailScreen, v: DetailValues): string[] {
  return screen.fields.flatMap((f): string[] => {
    switch (f) {
      case "studienfach":
        return [[v.studienfachKategorie, resolveStudiengang(v)].filter(Boolean).join(" · ")];
      case "abschlussart":
        return [label(ABSCHLUSSART_OPTIONS, v.abschlussart)];
      case "uni":
        return [resolveUni(v)];
      case "geburtsdatum":
        return [germanDate(v.geburtsdatum)];
      case "gefundenDurch": {
        const lines = [label(GEFUNDEN_DURCH_OPTIONS, v.gefundenDurch)];
        if (v.gefundenDurch === "empfehlung" && v.empfehlerName.trim()) {
          lines.push(`Empfohlen von ${v.empfehlerName.trim()}`);
        }
        if (v.vorstellung.trim()) lines.push(`„${v.vorstellung.trim()}"`);
        return lines;
      }
      case "photo":
        return [v.photoStorageKey ? "Foto hochgeladen" : "Kein Foto"];
      case "interesse":
        return [v.interesse.trim()];
      case "bdajFunktion":
        return [label(BDAJ_FUNKTION_OPTIONS, v.bdajFunktion)];
    }
  });
}
