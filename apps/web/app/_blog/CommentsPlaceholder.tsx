import { Card } from "@bdas/design-system";

/**
 * Comments are NOT built yet — this component only enforces the visibility rule
 * decided for them (spec requirement 5): external / signed-out visitors must
 * never see a comments area, not even via a post's share link. It renders
 * nothing unless the viewer is a signed-in member. When the comments module is
 * added, its list/composer mount here, behind the same `canSeeComments` gate.
 */
export function CommentsPlaceholder({ canSeeComments }: { canSeeComments: boolean }) {
  if (!canSeeComments) return null;
  return (
    <Card flat className="p-6">
      <h2 className="text-lg font-semibold text-bdas-ink">Kommentare</h2>
      <p className="mt-1 text-sm text-bdas-ink-muted">
        Kommentare folgen in Kürze. Sie sind nur für angemeldete Mitglieder sichtbar.
      </p>
    </Card>
  );
}
