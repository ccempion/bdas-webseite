export function youtubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseYoutubeInput(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  if (YOUTUBE_ID_RE.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.hostname === "youtu.be") {
    const id = url.pathname.slice(1);
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }
  if (url.hostname.endsWith("youtube.com") || url.hostname.endsWith("youtube-nocookie.com")) {
    const v = url.searchParams.get("v");
    if (v && YOUTUBE_ID_RE.test(v)) return v;
    const embedMatch = /^\/embed\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
    if (embedMatch) return embedMatch[1]!;
  }
  return null;
}
