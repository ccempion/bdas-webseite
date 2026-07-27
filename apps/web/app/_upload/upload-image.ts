/**
 * The two-step upload every picture surface performs: ask the route to sign a
 * URL, then PUT the bytes to it. Five surfaces had their own copy of this and
 * differed only in the payload they send and the fields they read back — so the
 * response type is the caller's, and everything else lives here.
 *
 * `fetch` is injected so the request sequence is unit-testable without a
 * browser or a server.
 */
export async function uploadImage<R extends { uploadUrl: string }>(
  endpoint: string,
  file: File,
  extra?: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: R } | { error: string }> {
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      ...extra,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? "Upload fehlgeschlagen." };
  }

  const signed = (await res.json()) as R;
  const put = await fetchImpl(signed.uploadUrl, { method: "PUT", body: file });
  if (!put.ok) return { error: "Upload fehlgeschlagen." };
  return { ok: signed };
}
