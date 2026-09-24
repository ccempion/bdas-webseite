import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Assemble from "../../../lib/data-export/assemble";
import type { CurrentMember } from "@bdas/members";

const buildDataExport = vi.fn();
const flags = new Set<string>();
let currentMember: CurrentMember | null = null;

vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("@bdas/feature-flags", () => ({ isFlagOn: (f: string) => flags.has(f) }));
vi.mock("@bdas/members", () => ({ getCurrentMember: async () => currentMember }));
vi.mock("../../_auth/flag", () => ({ requireAuthFlag: () => {} }));
vi.mock("../../_members/flag", () => ({ requireMembersFlag: () => {} }));
vi.mock("../../../lib/auth-cookie", () => ({ readSessionCookie: () => "session-cookie" }));
vi.mock("../../../lib/data-export/readers", () => ({ realReaders: () => ({}) }));
vi.mock("../../../lib/data-export/assemble", async (importOriginal) => ({
  ...(await importOriginal<typeof Assemble>()),
  buildDataExport: (...a: unknown[]) => buildDataExport(...a),
  toJson: () => '{"ok":true}',
  toZip: () => new Uint8Array([80, 75, 3, 4]),
}));

import { GET } from "./route";

const ATTACK = "?userId=usr_other&memberId=mbr_other&id=usr_other&email=evil%40example.org";

function me(overrides: Partial<CurrentMember> = {}): CurrentMember {
  return {
    user: {
      id: "usr_1",
      email: "mara@example.org",
      status: "active",
      roles: [],
      sessionId: "ses_1",
    },
    member: {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "Mara",
      lastName: "Beispiel",
      primaryGroupId: null,
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    grants: [],
    primaryGroupKind: null,
    hasGroupScope: false,
    isBdasMember: true,
    ...overrides,
  };
}

describe("GET /account/datenexport", () => {
  beforeEach(() => {
    buildDataExport.mockReset().mockResolvedValue({ exportedAt: "x", categories: [], skipped: [] });
    flags.clear();
    currentMember = me();
  });

  it("ignores userId/memberId/id/email in the query and exports only the session's own data", async () => {
    const res = await GET(new Request(`http://x/account/datenexport${ATTACK}`));

    expect(res.status).toBe(200);
    expect(buildDataExport).toHaveBeenCalledTimes(1);
    expect(buildDataExport).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      memberId: "mbr_1",
    });
    const seen = JSON.stringify(buildDataExport.mock.calls);
    expect(seen).not.toContain("usr_other");
    expect(seen).not.toContain("mbr_other");
    expect(seen).not.toContain("evil@example.org");
  });

  it("does the same for the ZIP format", async () => {
    flags.add("account_deletion");

    const res = await GET(new Request(`http://x/account/datenexport${ATTACK}&format=zip`));

    expect(res.status).toBe(200);
    expect(buildDataExport).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      memberId: "mbr_1",
    });
    expect(JSON.stringify(buildDataExport.mock.calls)).not.toContain("usr_other");
  });

  it("redirects an anonymous request and exports nothing, even with foreign ids in the query", async () => {
    currentMember = null;

    const res = await GET(new Request(`http://x/account/datenexport${ATTACK}`));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/anmelden");
    expect(buildDataExport).not.toHaveBeenCalled();
  });

  it("answers 404 for the ZIP format while account_deletion is off, without building anything", async () => {
    const res = await GET(new Request("http://x/account/datenexport?format=zip"));

    expect(res.status).toBe(404);
    expect(buildDataExport).not.toHaveBeenCalled();
  });

  it("serves the ZIP as a no-store attachment when account_deletion is on", async () => {
    flags.add("account_deletion");

    const res = await GET(new Request("http://x/account/datenexport?format=zip"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toContain("bdas-datenexport.zip");
  });
});
