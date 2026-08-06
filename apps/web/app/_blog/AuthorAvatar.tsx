/**
 * Feed avatar for a post author: the profile photo when one is available to the
 * viewer, otherwise a generated initials chip. Photos live in the private
 * profile-media bucket, so `photoUrl` is a short-lived signed URL resolved
 * server-side (see `_blog/access.ts`) and may be null at any time.
 */
export function AuthorAvatar({
  initials,
  name,
  photoUrl,
  size = 40,
}: {
  initials: string;
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`Profilbild von ${name}`}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

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
