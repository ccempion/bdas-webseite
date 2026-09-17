import { placeOf } from "./answers";
import type { Answers, ApplicationTargetKind, Flow, FlowEnv } from "./types";

export type ApplicationTarget =
  | { readonly kind: "group"; readonly groupId: string }
  | { readonly kind: "none" }
  | { readonly kind: "unavailable" };

/**
 * Das Antragsziel (Spec §5.2). Die einzige Gruppen-ID, die aus dem Browser
 * stammt, ist die gewählte Hochschulgruppe — und die zählt nur, wenn sie in
 * `env.groups` steht, also eine aktive Hochschulgruppe ist. Netzwerk und BDAJ
 * kommen ausschließlich aus `env`.
 */
export function resolveTarget(
  flow: Flow,
  kind: ApplicationTargetKind,
  answers: Answers,
  env: FlowEnv,
): ApplicationTarget {
  switch (kind) {
    case "keine":
      return { kind: "none" };
    case "netzwerk":
      return env.netzwerkGroupId
        ? { kind: "group", groupId: env.netzwerkGroupId }
        : { kind: "unavailable" };
    case "bdaj":
      return env.bdajGroupId ? { kind: "group", groupId: env.bdajGroupId } : { kind: "unavailable" };
    case "gewaehlte_gruppe": {
      const { groupId } = placeOf(flow, answers, env);
      return groupId ? { kind: "group", groupId } : { kind: "unavailable" };
    }
  }
}
