import { describe, expect, it } from "vitest";

import { FLOW } from "./flow";
import { resolveTarget } from "./target";
import type { FlowEnv } from "./types";

const ENV: FlowEnv = {
  groups: [{ id: "grp_ber", name: "BDAS Berlin", city: "Berlin" }],
  bdajGroupId: "grp_bdaj",
  netzwerkGroupId: "grp_netz",
};

describe("resolveTarget", () => {
  it("uses the chosen group only when the server lists it", () => {
    expect(
      resolveTarget(
        FLOW,
        "gewaehlte_gruppe",
        { studienort: { kind: "group", groupId: "grp_ber" } },
        ENV,
      ),
    ).toEqual({ kind: "group", groupId: "grp_ber" });
  });

  it("refuses a group id the server does not list — e.g. the netzwerk row itself", () => {
    expect(
      resolveTarget(
        FLOW,
        "gewaehlte_gruppe",
        { studienort: { kind: "group", groupId: "grp_netz" } },
        ENV,
      ),
    ).toEqual({ kind: "unavailable" });
  });

  it("maps netzwerk and bdaj to their rows", () => {
    expect(resolveTarget(FLOW, "netzwerk", {}, ENV)).toEqual({
      kind: "group",
      groupId: "grp_netz",
    });
    expect(resolveTarget(FLOW, "bdaj", {}, ENV)).toEqual({ kind: "group", groupId: "grp_bdaj" });
  });

  it("is unavailable when the row does not exist", () => {
    const bare = { ...ENV, bdajGroupId: null, netzwerkGroupId: null };
    expect(resolveTarget(FLOW, "netzwerk", {}, bare)).toEqual({ kind: "unavailable" });
    expect(resolveTarget(FLOW, "bdaj", {}, bare)).toEqual({ kind: "unavailable" });
  });

  it("files nothing for keine", () => {
    expect(resolveTarget(FLOW, "keine", {}, ENV)).toEqual({ kind: "none" });
  });
});
