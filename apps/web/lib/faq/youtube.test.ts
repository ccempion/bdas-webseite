import { describe, expect, it } from "vitest";
import { youtubeEmbedUrl, youtubeThumbnailUrl, parseYoutubeInput } from "./youtube";

describe("youtube urls", () => {
  it("builds nocookie embed and thumbnail urls", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1",
    );
    expect(youtubeThumbnailUrl("dQw4w9WgXcQ")).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });
});

describe("parseYoutubeInput", () => {
  it("accepts a raw 11-char id", () => {
    expect(parseYoutubeInput("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("extracts from watch, youtu.be and embed urls", () => {
    expect(parseYoutubeInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(parseYoutubeInput("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeInput("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });
  it("rejects garbage and empty input", () => {
    expect(parseYoutubeInput("")).toBeNull();
    expect(parseYoutubeInput("nicht-11-zeichen")).toBeNull();
    expect(parseYoutubeInput("https://example.com/video")).toBeNull();
  });
});
