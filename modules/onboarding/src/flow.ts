/**
 * Der Einstiegs-Ablauf (Spec 2026-09-16 §4.1, §5.1). Reine Daten.
 *
 * Eine neue Frage oder ein neuer Weg ist eine Änderung an dieser Datei;
 * `validate-flow.test.ts` prüft sie. Wer eine Frage entfernt oder umbenennt,
 * erhöht `version` — gespeicherte Antworten zu verschwundenen Fragen verwirft
 * `nextStep` still und fragt nur, was fehlt.
 *
 * Platzhalter: `{vorname}`, `{stadt}`, `{gruppe}` aus früheren Antworten;
 * `{eingabe}` nur in `noGroupHint` (die gerade getippte Stadt).
 */
import type { Flow } from "./types";

export const QUESTION_TYP = "typ";
export const QUESTION_NAME = "name";
export const QUESTION_STUDIENORT = "studienort";
export const QUESTION_AKTIV_WO = "aktiv_wo";
export const QUESTION_ABSICHT = "absicht";
export const QUESTION_GRUPPENWAHL = "gruppenwahl";

export const FLOW: Flow = {
  version: 2,
  start: QUESTION_TYP,
  questions: {
    [QUESTION_TYP]: {
      kind: "choice",
      title: "Was beschreibt dich am besten?",
      help: "Damit wir dich an die richtige Stelle bringen, dauert keine Minute.",
      options: [
        {
          value: "studiere",
          label: "Ich studiere gerade",
          hint: "Werde Teil deiner Hochschulgruppe",
          icon: "studium",
        },
        {
          value: "studiert",
          label: "Ich habe studiert",
          hint: "Bleib als Alumni verbunden",
          icon: "abschluss",
        },
        {
          value: "bdaj",
          label: "Ich bin in der BDAJ aktiv",
          hint: "Für alle Mitglieder der BDAJ",
          icon: "bdaj",
          requires: "bdaj",
        },
        {
          value: "unterstuetzen",
          label: "Ich möchte unterstützen",
          hint: "Förderer oder einfach neugierig",
          icon: "herz",
        },
      ],
    },
    [QUESTION_NAME]: {
      kind: "name",
      title: "Wie dürfen wir dich nennen?",
      help: "Mit deinem Namen sprechen wir dich an und stellen dich dem Vorstand vor.",
    },
    [QUESTION_STUDIENORT]: {
      kind: "place",
      title: "Wo studierst du, {vorname}?",
      help: "Damit wir dich mit der richtigen Gruppe verbinden.",
      skippable: false,
      noGroupHint: "In {eingabe} finden wir keine Gruppe. Kein Problem, es geht gleich weiter.",
    },
    [QUESTION_ABSICHT]: {
      kind: "choice",
      title: "In {stadt} gibt es noch kein BDAS. Was möchtest du?",
      help: "Beides geht: mit uns etwas aufbauen oder erst mal nur dabei sein.",
      options: [
        {
          value: "gruendung",
          label: "Ein BDAS in {stadt} gründen",
          hint: "Wir helfen dir beim Aufbau",
          icon: "studium",
        },
        {
          value: "dabei",
          label: "Erst mal einfach dabei sein",
          hint: "Ohne Gruppe vor Ort",
          icon: "herz",
        },
        {
          value: "beitreten",
          label: "Dem nächstgelegenen BDAS beitreten",
          hint: "Auch wenn es etwas weiter weg ist",
          icon: "bdaj",
        },
      ],
    },
    [QUESTION_GRUPPENWAHL]: {
      kind: "group_choice",
      title: "Welchem BDAS möchtest du beitreten?",
      help: "Such dir eine Gruppe aus. Über deine Bewerbung entscheidet dann der Vorstand dieser Gruppe.",
    },
    [QUESTION_AKTIV_WO]: {
      kind: "place",
      title: "Wo warst du aktiv, {vorname}?",
      help: "Gruppe oder Stadt, so finden dich Leute von damals. Du kannst das überspringen.",
      skippable: true,
      noGroupHint: "In {eingabe} gab es keine Gruppe? Kein Problem, wir merken uns die Stadt.",
    },
  },
  rules: [
    { from: QUESTION_TYP, to: { question: QUESTION_NAME } },
    {
      from: QUESTION_NAME,
      when: { kind: "equals", question: QUESTION_TYP, value: "studiere" },
      to: { question: QUESTION_STUDIENORT },
    },
    {
      from: QUESTION_NAME,
      when: { kind: "equals", question: QUESTION_TYP, value: "studiert" },
      to: { question: QUESTION_AKTIV_WO },
    },
    {
      from: QUESTION_NAME,
      when: { kind: "equals", question: QUESTION_TYP, value: "bdaj" },
      to: { outcome: "bdaj" },
    },
    { from: QUESTION_NAME, to: { outcome: "foerderer" } },
    {
      from: QUESTION_STUDIENORT,
      when: { kind: "has_group", question: QUESTION_STUDIENORT },
      to: { outcome: "student" },
    },
    { from: QUESTION_STUDIENORT, to: { question: QUESTION_ABSICHT } },
    {
      from: QUESTION_ABSICHT,
      when: { kind: "equals", question: QUESTION_ABSICHT, value: "beitreten" },
      to: { question: QUESTION_GRUPPENWAHL },
    },
    {
      from: QUESTION_ABSICHT,
      when: { kind: "equals", question: QUESTION_ABSICHT, value: "gruendung" },
      to: { outcome: "student_gruendung" },
    },
    { from: QUESTION_ABSICHT, to: { outcome: "student_ohne_gruppe" } },
    { from: QUESTION_GRUPPENWAHL, to: { outcome: "student" } },
    { from: QUESTION_AKTIV_WO, to: { outcome: "alumnus" } },
  ],
  outcomes: {
    student: {
      userType: "student",
      target: "gewaehlte_gruppe",
      title: "Du wärst als Student*in bei {gruppe} angemeldet.",
      benefits: [
        "Events und Treffen deiner Hochschulgruppe",
        "Bundesweites Netzwerk alevitischer Studierender",
        "Zugriff auf die Dateien deiner Gruppe",
      ],
      decider: "Der Vorstand von {gruppe}",
      duration: "meist innerhalb weniger Tage",
      submittedTo: "bei {gruppe}",
    },
    student_gruendung: {
      userType: "student",
      target: "keine",
      title:
        "Du wärst als Student*in in {stadt} angemeldet, mit uns an deiner Seite für die Gründung.",
      benefits: [
        "Unterstützung, wenn du in {stadt} eine Gruppe gründen willst",
        "Bundesweites Netzwerk alevitischer Studierender",
        "Einladungen zu überregionalen Events",
      ],
      decider: "Der Bundesvorstand",
      duration: "meist innerhalb von zwei Tagen",
      submittedTo: "beim Bundesvorstand",
    },
    student_ohne_gruppe: {
      userType: "student",
      target: "keine",
      title: "Du wärst als Student*in in {stadt} angemeldet, auch ohne Gruppe vor Ort.",
      benefits: [
        "Bundesweites Netzwerk alevitischer Studierender",
        "Einladungen zu überregionalen Events",
        "Zugang zur Plattform, auch ohne Gruppe in deiner Stadt",
      ],
      decider: "Der Bundesvorstand",
      duration: "meist innerhalb von zwei Tagen",
      submittedTo: "beim Bundesvorstand",
    },
    alumnus: {
      userType: "alumnus",
      target: "keine",
      title: "Du wärst als Alumna oder Alumnus angemeldet.",
      benefits: [
        "Kontakt zu ehemaligen und aktiven Studierenden",
        "Einladungen zu Alumni-Treffen",
        "Neuigkeiten aus dem Verband",
      ],
      decider: "Der Bundesvorstand",
      duration: "meist innerhalb von zwei Tagen",
      submittedTo: "beim Bundesvorstand",
    },
    foerderer: {
      userType: "foerderer",
      target: "netzwerk",
      title: "Du wärst als Förderer*in angemeldet.",
      benefits: [
        "Einblick in unsere Arbeit",
        "Einladungen zu offenen Events",
        "Neuigkeiten aus dem Verband",
      ],
      decider: "Der Bundesvorstand",
      duration: "meist innerhalb von zwei Tagen",
      submittedTo: "beim Bundesvorstand",
    },
    bdaj: {
      userType: "bdaj",
      target: "bdaj",
      title: "Du wärst als BDAJ-Mitglied angemeldet.",
      benefits: [
        "Gemeinsamer Bereich für BDAJ und BDAS",
        "Zugriff auf geteilte Dateien",
        "Einladungen zu gemeinsamen Events",
      ],
      decider: "Der Bundesvorstand",
      duration: "meist innerhalb von zwei Tagen",
      submittedTo: "beim Bundesvorstand",
    },
  },
};
