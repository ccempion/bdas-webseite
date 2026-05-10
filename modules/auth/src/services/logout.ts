import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getEventBus } from "@bdas/events";

import type { UserLoggedOut } from "../events.js";
import { revokeSession } from "../sessions.js";

export type Db = PostgresJsDatabase<Record<string, never>>;

export async function logout(db: Db, args: { userId: string; sessionId: string }): Promise<void> {
  await revokeSession(db, args.sessionId);
  const event: UserLoggedOut = {
    type: "auth.user.logged_out",
    userId: args.userId,
    sessionId: args.sessionId,
    at: new Date(),
  };
  await getEventBus().publish(event);
}
