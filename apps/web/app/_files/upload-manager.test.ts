import { describe, expect, it, vi } from "vitest";

import type { FileMeta } from "@bdas/files";

import { runUploads, validateFile, type UploadDeps, type UploadInput } from "./upload-manager";

const KB = 1024;
const MB = 1024 * KB;

function fakeFile(over: Partial<UploadInput> = {}): UploadInput {
  return {
    id: over.id ?? "u1",
    name: over.name ?? "doc.pdf",
    mimeType: over.mimeType ?? "application/pdf",
    sizeBytes: over.sizeBytes ?? 10,
    body: over.body ?? (new Blob(["x"]) as Blob),
  };
}

function fileMeta(id: string): FileMeta {
  return {
    id,
    folderId: "fol_1",
    filename: "doc.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10,
    status: "ready",
    uploadedBy: "mem_1",
    uploadedAt: new Date(0),
    lastModifiedAt: new Date(0),
  };
}

/** Happy-path deps: request → put (one progress tick) → confirm, all succeed. */
function okDeps(over: Partial<UploadDeps> = {}): UploadDeps {
  return {
    requestUpload: async () => ({ fileId: "fil_1", uploadUrl: "https://put" }),
    putBytes: async (_url, _body, _mime, onProgress) => {
      onProgress(100);
    },
    confirmUpload: async (fileId) => ({ file: fileMeta(fileId) }),
    ...over,
  };
}

describe("validateFile", () => {
  const limits = { allowedMime: new Set(["application/pdf"]), maxBytes: 25 * MB };

  it("accepts an allowed type within the size cap", () => {
    expect(validateFile(fakeFile({ sizeBytes: 1 * MB }), limits)).toBeNull();
  });

  it("rejects a disallowed MIME type", () => {
    expect(validateFile(fakeFile({ mimeType: "application/x-msdownload" }), limits)).toMatch(
      /Dateityp/,
    );
  });

  it("rejects an over-cap or empty file", () => {
    expect(validateFile(fakeFile({ sizeBytes: 26 * MB }), limits)).toMatch(/25 MB/);
    expect(validateFile(fakeFile({ sizeBytes: 0 }), limits)).toMatch(/25 MB/);
  });
});

describe("runUploads", () => {
  it("drives a file queued → uploading → done", async () => {
    const states: string[] = [];
    const onChange = vi.fn((items) => states.push(items[0].status.kind));

    const result = await runUploads({ files: [fakeFile()], deps: okDeps(), onChange });

    expect(result[0]!.status).toEqual({ kind: "done", file: fileMeta("fil_1") });
    // queued is the initial render; uploading + done arrive via onChange.
    expect(states).toContain("uploading");
    expect(states.at(-1)).toBe("done");
  });

  it("reports progress percentages while uploading", async () => {
    const seen: number[] = [];
    const deps = okDeps({
      putBytes: async (_u, _b, _m, onProgress) => {
        onProgress(40);
        onProgress(90);
      },
    });
    await runUploads({
      files: [fakeFile()],
      deps,
      onChange: (items) => {
        const s = items[0]!.status;
        if (s.kind === "uploading") seen.push(s.progress);
      },
    });
    expect(seen).toContain(40);
    expect(seen).toContain(90);
  });

  it("marks failed with the German message when requestUpload is refused", async () => {
    const deps = okDeps({ requestUpload: async () => ({ error: "Dateityp nicht erlaubt." }) });
    const result = await runUploads({ files: [fakeFile()], deps, onChange: vi.fn() });
    expect(result[0]!.status).toEqual({ kind: "failed", message: "Dateityp nicht erlaubt." });
  });

  it("marks failed when the byte PUT rejects", async () => {
    const deps = okDeps({
      putBytes: async () => {
        throw new Error("network");
      },
    });
    const result = await runUploads({ files: [fakeFile()], deps, onChange: vi.fn() });
    expect(result[0]!.status.kind).toBe("failed");
  });

  it("marks failed when confirmUpload is refused", async () => {
    const deps = okDeps({
      confirmUpload: async () => ({ error: "Es wurde keine hochgeladene Datei gefunden." }),
    });
    const result = await runUploads({ files: [fakeFile()], deps, onChange: vi.fn() });
    expect(result[0]!.status).toEqual({
      kind: "failed",
      message: "Es wurde keine hochgeladene Datei gefunden.",
    });
  });

  it("fails invalid files locally without calling the network", async () => {
    const requestUpload = vi.fn(async () => ({ fileId: "x", uploadUrl: "u" }));
    const result = await runUploads({
      files: [fakeFile({ mimeType: "application/x-msdownload" })],
      deps: okDeps({ requestUpload }),
      onChange: vi.fn(),
      validate: (f) =>
        validateFile(f, { allowedMime: new Set(["application/pdf"]), maxBytes: 25 * MB }),
    });
    expect(result[0]!.status.kind).toBe("failed");
    expect(requestUpload).not.toHaveBeenCalled();
  });

  it("never exceeds the concurrency cap of 3", async () => {
    let inFlight = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const deps = okDeps({
      putBytes: () =>
        new Promise<void>((resolve) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          release.push(() => {
            inFlight -= 1;
            resolve();
          });
        }),
    });

    const files = Array.from({ length: 7 }, (_, i) => fakeFile({ id: `u${i}` }));
    const run = runUploads({ files, deps, onChange: vi.fn(), concurrency: 3 });

    // Release one in-flight upload at a time; the pool refills behind each.
    for (let i = 0; i < files.length; i++) {
      await vi.waitFor(() => expect(release.length).toBeGreaterThan(0));
      release.shift()!();
    }
    const result = await run;
    expect(result.every((r) => r.status.kind === "done")).toBe(true);
    expect(peak).toBe(3);
  });
});
