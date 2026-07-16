import { z } from "zod";

const PuckComponent = z
  .object({ type: z.string(), props: z.record(z.unknown()) })
  .passthrough();

/**
 * Structural check of Puck's `Data` shape. The module stores documents
 * opaquely — it never imports Puck (ADR 0023); this schema is the boundary.
 */
export const PuckDataSchema = z
  .object({
    root: z.object({ props: z.record(z.unknown()).optional() }).passthrough(),
    content: z.array(PuckComponent),
    zones: z.record(z.array(PuckComponent)).optional(),
  })
  .passthrough();

export type PageData = z.infer<typeof PuckDataSchema>;

export type ContentPage = {
  readonly slug: string;
  readonly data: PageData;
  readonly updatedAt: Date;
};

/** Minimal grant shape — structurally compatible with @bdas/members' Grant. */
export type ActorGrant = {
  readonly role: string;
  readonly groupId: string | null;
};

export type ContentActor = {
  readonly userId: string;
  readonly grants: ReadonlyArray<ActorGrant>;
};
