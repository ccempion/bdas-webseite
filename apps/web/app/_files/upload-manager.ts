/**
 * Framework-free orchestration for multi-file uploads. The React component owns
 * the DOM and the network primitives; this module owns the state machine —
 * per-file queued → uploading(progress) → done | failed — with bounded
 * concurrency. Network calls are injected so the transitions are unit-testable
 * without a browser or a server.
 */
import type { FileMeta } from "@bdas/files";

export type UploadStatus =
  | { readonly kind: "queued" }
  | { readonly kind: "uploading"; readonly progress: number }
  | { readonly kind: "done"; readonly file: FileMeta }
  | { readonly kind: "failed"; readonly message: string };

export type UploadInput = {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly body: Blob;
};

export type UploadItem = {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly status: UploadStatus;
};

/** The three network steps, injected so tests can drive them deterministically. */
export type UploadDeps = {
  requestUpload(input: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<{ fileId: string; uploadUrl: string } | { error: string }>;
  putBytes(
    url: string,
    body: Blob,
    mimeType: string,
    onProgress: (pct: number) => void,
  ): Promise<void>;
  confirmUpload(fileId: string): Promise<{ file: FileMeta } | { error: string }>;
};

export type FileLimits = { readonly allowedMime: ReadonlySet<string>; readonly maxBytes: number };

/**
 * Local pre-flight mirror of the service's rules so obviously-bad files fail
 * instantly without a round-trip. The server still re-validates authoritatively.
 * Returns a German error message, or null when acceptable.
 */
export function validateFile(file: UploadInput, limits: FileLimits): string | null {
  if (!limits.allowedMime.has(file.mimeType)) return "Dateityp nicht erlaubt.";
  if (file.sizeBytes <= 0 || file.sizeBytes > limits.maxBytes) {
    return "Datei überschreitet die maximale Größe (25 MB).";
  }
  return null;
}

const DEFAULT_CONCURRENCY = 3;

/**
 * Run all uploads, at most `concurrency` in flight. `onChange` fires after every
 * state transition with a fresh snapshot of all items. Resolves with the final
 * snapshot once every file has settled (done or failed). Never rejects — a file
 * that errors becomes `failed`.
 */
export async function runUploads(args: {
  files: readonly UploadInput[];
  deps: UploadDeps;
  onChange: (items: readonly UploadItem[]) => void;
  concurrency?: number;
  validate?: (f: UploadInput) => string | null;
}): Promise<readonly UploadItem[]> {
  const { files, deps, onChange, validate } = args;
  const concurrency = args.concurrency ?? DEFAULT_CONCURRENCY;

  const items: UploadItem[] = files.map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    status: { kind: "queued" },
  }));

  const set = (index: number, status: UploadStatus): void => {
    items[index] = { ...items[index]!, status };
    onChange(items.map((it) => ({ ...it })));
  };

  const uploadOne = async (file: UploadInput, index: number): Promise<void> => {
    const invalid = validate?.(file) ?? null;
    if (invalid) {
      set(index, { kind: "failed", message: invalid });
      return;
    }

    set(index, { kind: "uploading", progress: 0 });
    const requested = await deps.requestUpload({
      filename: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });
    if ("error" in requested) {
      set(index, { kind: "failed", message: requested.error });
      return;
    }

    try {
      await deps.putBytes(requested.uploadUrl, file.body, file.mimeType, (pct) =>
        set(index, { kind: "uploading", progress: Math.max(0, Math.min(100, Math.round(pct))) }),
      );
    } catch {
      set(index, { kind: "failed", message: "Upload fehlgeschlagen." });
      return;
    }

    const confirmed = await deps.confirmUpload(requested.fileId);
    if ("error" in confirmed) {
      set(index, { kind: "failed", message: confirmed.error });
      return;
    }
    set(index, { kind: "done", file: confirmed.file });
  };

  // Worker pool: each worker pulls the next index until the queue drains.
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const index = next++;
      await uploadOne(files[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, () => worker()));

  return items.map((it) => ({ ...it }));
}
