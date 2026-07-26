import { beforeEach, describe, expect, it, vi } from "vitest";

const signedDownloadUrl = vi.fn();

vi.mock("@bdas/storage", () => ({
  getProfileMediaStorage: () => ({ signedDownloadUrl }),
}));

import { PHOTO_URL_TTL_SECONDS, signedProfilePhotoUrl } from "./photo-url";

describe("signedProfilePhotoUrl", () => {
  beforeEach(() => {
    signedDownloadUrl.mockReset();
  });

  it("returns null without touching storage when there is no key", async () => {
    await expect(signedProfilePhotoUrl(null)).resolves.toBeNull();
    await expect(signedProfilePhotoUrl(undefined)).resolves.toBeNull();
    await expect(signedProfilePhotoUrl("")).resolves.toBeNull();
    expect(signedDownloadUrl).not.toHaveBeenCalled();
  });

  it("signs the stored key with the short TTL", async () => {
    signedDownloadUrl.mockResolvedValue({ url: "https://signed.example/photo.jpg" });

    await expect(signedProfilePhotoUrl("profile/u1/photo.jpg")).resolves.toBe(
      "https://signed.example/photo.jpg",
    );
    expect(signedDownloadUrl).toHaveBeenCalledWith({
      storageKey: "profile/u1/photo.jpg",
      ttlSeconds: PHOTO_URL_TTL_SECONDS,
    });
  });

  it("degrades to null when the object is missing or storage is unreachable", async () => {
    signedDownloadUrl.mockRejectedValue(new Error("object not found"));

    await expect(signedProfilePhotoUrl("profile/u1/gone.jpg")).resolves.toBeNull();
  });
});
