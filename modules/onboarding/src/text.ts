import { placeOf } from "./answers";
import type { Answers, Flow, FlowEnv, NameAnswer } from "./types";

export const PLACEHOLDERS = ["vorname", "stadt", "gruppe"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export type TextContext = { readonly [K in Placeholder]: string };

const TOKEN = /\{([a-z_]+)\}/g;

export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[1] ?? "");
}

const isName = (v: unknown): v is NameAnswer =>
  typeof v === "object" && v !== null && "firstName" in v;

export function textContext(flow: Flow, answers: Answers, env: FlowEnv): TextContext {
  const name = Object.values(answers).find(isName);
  const place = placeOf(flow, answers, env);
  return {
    vorname: name?.firstName ?? "",
    stadt: place.city ?? "deiner Stadt",
    gruppe: place.groupName ?? "deiner Gruppe",
  };
}

/** Ersetzt `{vorname}`, `{stadt}`, `{gruppe}` und `{eingabe}`. Ein leerer
 *  Vorname nimmt das Komma davor mit („Wo studierst du?"). */
export function fillText(text: string, ctx: TextContext, eingabe = ""): string {
  const withoutEmptyName = ctx.vorname === "" ? text.replace(/,\s*\{vorname\}/g, "") : text;
  return withoutEmptyName.replace(TOKEN, (whole, key: string) => {
    if (key === "eingabe") return eingabe;
    return (PLACEHOLDERS as ReadonlyArray<string>).includes(key)
      ? ctx[key as Placeholder]
      : whole;
  });
}
