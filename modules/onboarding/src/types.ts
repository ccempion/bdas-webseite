/**
 * Öffentliche Typen des Onboarding-Moduls (Spec 2026-09-16 §5.1).
 *
 * Der Ablauf ist reine Daten und JSON-serialisierbar: er läuft im Browser für
 * sofortige Reaktion und auf dem Server als maßgebliche Prüfung. Frage-IDs sind
 * deshalb schlichte Strings; `validateFlow` fängt Tippfehler, nicht der Compiler.
 */

export const OUTCOME_IDS = [
  "student",
  "student_gruendung",
  "student_ohne_gruppe",
  "alumnus",
  "foerderer",
  "bdaj",
] as const;
export type OutcomeId = (typeof OUTCOME_IDS)[number];

/** Der Nutzertyp entscheidet in PR 2 über den Feldsatz von Teil 3. Die Namen
 *  stimmen mit den Feldsatz-Schlüsseln in `@bdas/profile` überein. */
export type UserType = "student" | "alumnus" | "foerderer" | "bdaj";

export type ChoiceOption = {
  readonly value: string;
  readonly label: string;
  readonly hint: string;
  readonly icon: "studium" | "abschluss" | "bdaj" | "herz";
  /** Karte nur zeigen, wenn die Laufzeit das erlaubt (Spec §5.4). */
  readonly requires?: "bdaj";
};

export type Question =
  | {
      readonly kind: "choice";
      readonly title: string;
      readonly help: string;
      readonly options: ReadonlyArray<ChoiceOption>;
    }
  | { readonly kind: "name"; readonly title: string; readonly help: string }
  | {
      readonly kind: "place";
      readonly title: string;
      readonly help: string;
      readonly skippable: boolean;
      /** Gezeigt, wenn die eingegebene Stadt keine Gruppe hat. `{eingabe}` ist
       *  die gerade getippte Stadt — kein Platzhalter aus früheren Antworten. */
      readonly noGroupHint: string;
    }
  | {
      /** Eine Gruppe aus der Liste aller aktiven Hochschulgruppen. */
      readonly kind: "group_choice";
      readonly title: string;
      readonly help: string;
    };

export type Condition =
  | { readonly kind: "equals"; readonly question: string; readonly value: string }
  /** Die Antwort ist eine Gruppe, die in `env.groups` steht (aktiv, Hochschulgruppe). */
  | { readonly kind: "has_group"; readonly question: string };

export type Target = { readonly question: string } | { readonly outcome: OutcomeId };

/** Regeln werden in Reihenfolge geprüft; die erste passende gewinnt. Die letzte
 *  Regel einer Frage hat kein `when` (prüft `validateFlow`). */
export type Rule = { readonly from: string; readonly when?: Condition; readonly to: Target };

/** Wohin der Antrag geht (Spec §5.2). */
export type ApplicationTargetKind = "gewaehlte_gruppe" | "netzwerk" | "bdaj" | "keine";

export type Outcome = {
  readonly userType: UserType;
  readonly target: ApplicationTargetKind;
  readonly title: string;
  readonly benefits: ReadonlyArray<string>;
  readonly decider: string;
  readonly duration: string;
  readonly hint?: string;
  /** Fertig-Bildschirm: „Deine Bewerbung liegt jetzt {submittedTo}." — mit Präposition („bei …", „beim …"). */
  readonly submittedTo: string;
};

export type Flow = {
  readonly version: number;
  readonly start: string;
  readonly questions: Readonly<Record<string, Question>>;
  readonly rules: ReadonlyArray<Rule>;
  readonly outcomes: Readonly<Record<OutcomeId, Outcome>>;
};

export type NameAnswer = { readonly firstName: string; readonly lastName: string };

export type PlaceAnswer =
  | { readonly kind: "group"; readonly groupId: string }
  | { readonly kind: "city"; readonly city: string }
  | { readonly kind: "skipped" };

export type AnswerValue = string | NameAnswer | PlaceAnswer;

export type Answers = Readonly<Record<string, AnswerValue>>;

/** Eine aktive Hochschulgruppe, wie der Ablauf sie braucht. */
export type FlowGroup = { readonly id: string; readonly name: string; readonly city: string };

/** Was sich zur Laufzeit ändert. Serialisierbar, damit es als Prop in den Browser darf. */
export type FlowEnv = {
  readonly groups: ReadonlyArray<FlowGroup>;
  readonly bdajGroupId: string | null;
  readonly netzwerkGroupId: string | null;
};

export type Step =
  | { readonly kind: "question"; readonly question: string }
  | { readonly kind: "outcome"; readonly outcome: OutcomeId };

export type JourneyStatus = "details_offen" | "abgeschickt";

export type Journey = {
  readonly id: string;
  readonly userId: string;
  readonly flowVersion: number;
  readonly answers: Answers;
  readonly details: Readonly<Record<string, unknown>>;
  readonly entrySource: string;
  readonly outcome: OutcomeId;
  readonly stadt: string | null;
  readonly status: JourneyStatus;
  /** ID des Gruppenantrags aus `@bdas/members`; null bei Alumni und solange nichts abgeschickt ist. */
  readonly applicationRef: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type ApplicationIntent = { readonly outcome: OutcomeId; readonly status: JourneyStatus };
