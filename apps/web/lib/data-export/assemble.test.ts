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
    profile: rec("profile", {
      studiengang: "Kath. Theologie",
      updatedBy: "usr_admin",
      secret: "x",
    }),
    organizedEvents: rec("organizedEvents", [{ id: "evt_1", title: "Sommerfest" }]),
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
        "organizedEvents:usr_me",
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
    expect(out.skipped.map((s) => s.category)).toContain(
      "veranstaltungen (Anmeldungen/Anwesenheit)",
    );
  });

  it.each([
    { flag: "files", key: "dateien", files: ["dateien.csv"], readers: ["files"] },
    {
      flag: "blog",
      key: "blog",
      files: ["blog_beitraege.csv", "blog_kommentare.csv"],
      readers: ["blog"],
    },
    {
      flag: "notifications",
      key: "benachrichtigungen",
      files: ["benachrichtigungen.csv"],
      readers: ["notifications"],
    },
    { flag: "profile", key: "profil", files: ["profil.csv"], readers: ["profile"] },
    {
      flag: "events",
      key: "veranstaltungen",
      files: [
        "veranstaltungen_anmeldungen.csv",
        "veranstaltungen_organisiert.csv",
        "veranstaltungen_anwesenheit.csv",
      ],
      readers: ["participation", "organizedEvents"],
    },
  ])(
    "skips $key when the $flag flag is off: no files, one manifest entry, reader not called",
    async ({ flag, key, files, readers }) => {
      const calls: string[] = [];
      const out = await buildDataExport(
        stub(calls, { enabled: (f) => f !== flag }),
        session("usr_me", "mem_me"),
      );
      const names = out.categories.map((c) => c.file);
      for (const f of files) expect(names).not.toContain(f);
      expect(out.skipped).toEqual([{ category: key, reason: "Modul nicht aktiv" }]);
      for (const r of readers) expect(calls.some((c) => c.startsWith(`${r}:`))).toBe(false);
    },
  );

  it("exports organized events even without a member row", async () => {
    const out = await buildDataExport(stub([]), session("usr_bare", null));
    const zip = unzipSync(toZip(out));
    expect(strFromU8(zip["veranstaltungen_organisiert.csv"]!)).toContain("Sommerfest");
    expect(out.skipped).toEqual([
      {
        category: "veranstaltungen (Anmeldungen/Anwesenheit)",
        reason: "Kein Mitgliedseintrag",
      },
    ]);
  });

  it("projects rows through the column allowlist in both JSON and CSV", async () => {
    const out = await buildDataExport(stub([]), session("usr_me", "mem_me"));
    const json = toJson(out);
    const csv = strFromU8(unzipSync(toZip(out))["profil.csv"]!);
    expect(json).toContain("Kath. Theologie");
    expect(csv).toContain("Kath. Theologie");
    for (const s of ["usr_admin", "secret"]) {
      expect(json).not.toContain(s);
      expect(csv).not.toContain(s);
    }
  });

  it("emits a header-only CSV for an empty category (present, not forgotten)", async () => {
    const out = await buildDataExport(stub([]), session("usr_me", "mem_me"));
    const zip = unzipSync(toZip(out));
    const dateien = out.categories.find((c) => c.file === "dateien.csv")!;
    const raw = new TextDecoder("utf-8", { ignoreBOM: true }).decode(zip["dateien.csv"]!);
    expect(raw).toBe("\uFEFF" + dateien.columns.join(",") + "\r\n");
    expect(strFromU8(zip["LIESMICH.txt"]!)).toContain("Gast");
  });

  it("toJson contains every category and no undeclared keys", async () => {
    const out = await buildDataExport(stub([]), session("usr_me", "mem_me"));
    const parsed = JSON.parse(toJson(out)) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      ["categories", "exportedAt", "hinweise", "skipped"].sort(),
    );
  });

  it("discloses the not-yet-exported data in LIESMICH.txt and in the JSON", async () => {
    const out = await buildDataExport(stub([]), session("usr_me", "mem_me"));
    const readme = strFromU8(unzipSync(toZip(out))["LIESMICH.txt"]!);
    expect(readme).toContain("Noch nicht enthalten");
    expect(readme).toContain("file_access_log");
    expect(toJson(out)).toContain("file_access_log");
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
