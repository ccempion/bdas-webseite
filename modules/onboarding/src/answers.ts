import type { AnswerValue, Answers, Flow, FlowEnv, PlaceAnswer, Question } from "./types";

export const MAX_NAME = 120;
export const MAX_CITY = 120;
const MAX_ID = 64;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= max ? t : null;
};

/** Die bereinigte Antwort, oder null, wenn sie zur Frage nicht passt. */
function clean(question: Question, value: unknown): AnswerValue | null {
  switch (question.kind) {
    case "choice":
      return typeof value === "string" && question.options.some((o) => o.value === value)
        ? value
        : null;
    case "name": {
      if (!isObj(value)) return null;
      const firstName = text(value["firstName"], MAX_NAME);
      const lastName = text(value["lastName"], MAX_NAME);
      return firstName && lastName ? { firstName, lastName } : null;
    }
    case "place": {
      if (!isObj(value)) return null;
      if (value["kind"] === "group") {
        const groupId = text(value["groupId"], MAX_ID);
        return groupId ? { kind: "group", groupId } : null;
      }
      if (value["kind"] === "city") {
        const city = text(value["city"], MAX_CITY);
        return city ? { kind: "city", city } : null;
      }
      if (value["kind"] === "skipped") return question.skippable ? { kind: "skipped" } : null;
      return null;
    }
  }
}

export function isValidAnswer(question: Question, value: unknown): value is AnswerValue {
  return clean(question, value) !== null;
}

/**
 * Nur bekannte Fragen mit gültiger Antwort überleben. Das deckt zwei Fälle ab:
 * manipulierte Eingaben aus dem Browser und Antworten zu Fragen, die eine neuere
 * Ablauf-Version nicht mehr kennt (Spec §5.3, Versionswechsel).
 */
export function sanitizeAnswers(flow: Flow, raw: unknown): Answers {
  if (!isObj(raw)) return {};
  const out: Record<string, AnswerValue> = {};
  for (const [id, question] of Object.entries(flow.questions)) {
    const value = clean(question, raw[id]);
    if (value !== null) out[id] = value;
  }
  return out;
}

const isPlace = (v: AnswerValue | undefined): v is PlaceAnswer =>
  typeof v === "object" && v !== null && "kind" in v;

/**
 * Der Ort, auf den sich das Ergebnis bezieht. Eine gewählte Gruppe schlägt eine
 * getippte Stadt: wer in einer Stadt ohne Gruppe studiert und einer Gruppe
 * anderswo beitritt, bewirbt sich dort, nicht im Netzwerk. Eine Gruppen-ID
 * zählt nur, wenn sie in `env.groups` steht — die Liste kommt vom Server, die
 * ID vom Browser.
 */
export function placeOf(
  flow: Flow,
  answers: Answers,
  env: FlowEnv,
): { groupId: string | null; groupName: string | null; city: string | null } {
  let city: string | null = null;

  for (const id of Object.keys(flow.questions)) {
    const value = answers[id];
    if (!isPlace(value)) continue;
    if (value.kind === "group") {
      const group = env.groups.find((g) => g.id === value.groupId);
      if (group) return { groupId: group.id, groupName: group.name, city: group.city };
      continue;
    }
    if (value.kind === "city" && city === null) city = value.city;
  }

  return { groupId: null, groupName: null, city };
}
