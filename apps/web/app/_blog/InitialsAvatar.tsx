/**
 * Feed avatar. Members carry no profile photo (the members table stores only a
 * name), so the feed shows a generated initials chip instead of an image. If an
 * avatar column is ever added to the members module, swap this for an <img>.
 */
export function InitialsAvatar({ initials, size = 40 }: { initials: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-bdas-overlay-soft font-semibold text-bdas-ink-body"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials}
    </span>
  );
}
