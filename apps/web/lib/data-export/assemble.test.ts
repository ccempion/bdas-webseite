import { describe, expect, it } from "vitest";
import { buildDataExport, principalFrom, toJson, toZip, type Readers } from "./assemble";
import { unzipSync, strFromU8 } from "fflate";

const session = (userId: string, memberId: string | null) =>
  principalFrom({ user: { id: userId }, member: memberId === null ? null : { id: memberId } });

function stub(calls: string[], over: Partial<Readers> = {}): Readers {
  const rec =
    <T>(name: string, v: T) =>
    async (id: string): Promise<T> => {
      calls.push(`${name}:${id}`);
      return v;
    };
  return {
    enabled: () => true,
    account: rec("account", { id: "usr_me", email: "me@example.de" }),
    sessions: rec("sessions", [{ ip: "10.0.0.1" }]),
    member: rec("member", { member: { id: "mem_me" }, roleGrants: [], groupChangeRequests: [] }),
    profile: rec("profile", { studiengang: "Kath. Theologie" }),
    participation: rec("participation", { registrations: [{ eventTitle: "X" }], attendance: [] }),
    files: rec("files", []),
    blog: rec("blog", { posts: [], comments: [] }),
    notifications: rec("notifications", []),
    ...over,
  };
}

describe("buildDataExport", () => {
  it("calls every reader only with the principal's own ids", async () => {
    const calls: string[] = [];
    await buildDataExport(stub(calls), session("usr_me", "mem_me"));
    expect(calls.sort()).toEqual(
      [
        "account:usr_me",
        "sessions:usr_me",
        "member:usr_me",
        "profile:usr_me",
        "participation:mem_me",
        "files:usr_me",
        "blog:usr_me",
        "notifications:usr_me",
      ].sort(),
    );
  });

  it("skips member-keyed readers when there is no member row and says so", async () => {
    const calls: string[] = [];
    const out = await buildDataExport(stub(calls), session("usr_bare", null));
    expect(calls.some((c) => c.startsWith("participation"))).toBe(false);
    expect(out.skipped.map((s) => s.category)).toContain("veranstaltungen");
  });

  it("skips modules whose feature flag is off and lists them in the manifest", async () => {
    const out = await buildDataExport(
      stub([], { enabled: (f) => f !== "files" }),
      session("usr_me", "mem_me"),
    );
    expect(out.categories.map((c) => c.file)).not.toContain("dateien.csv");
    expect(out.skipped).toContainEqual({ category: "dateien", reason: "Modul nicht aktiv" });
  });

  it("emits a header-only CSV for an empty category (present, not forgotten)", async () => {
    const out = await buildDataExport(stub([]), session("usr_me", "mem_me"));
    const zip = unzipSync(toZip(out));
    expect(strFromU8(zip["dateien.csv"]!)).toContain("filename");
    expect(strFromU8(zip["LIESMICH.txt"]!)).toContain("Gast");
  });

  it("toJson contains every category and no undeclared keys", async () => {
    const out = await buildDataExport(stub([]), session("usr_me", "mem_me"));
    const parsed = JSON.parse(toJson(out)) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["categories", "exportedAt", "skipped"].sort());
  });

  it("does not accept a hand-built principal (compile-time guard, checked by `pnpm typecheck`)", async () => {
    // @ts-expect-error a literal { userId, memberId } lacks the PRINCIPAL brand
    await buildDataExport(stub([]), { userId: "usr_other", memberId: "mem_other" });
  });
});

describe("principalFrom", () => {
  it("derives both ids from the session identity and from nothing else", () => {
    expect(principalFrom({ user: { id: "usr_me" }, member: { id: "mem_me" } })).toEqual({
      userId: "usr_me",
      memberId: "mem_me",
    });
    expect(principalFrom({ user: { id: "usr_bare" }, member: null })).toEqual({
      userId: "usr_bare",
      memberId: null,
    });
  });
});
