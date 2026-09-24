import { isFlagOn } from "@bdas/feature-flags";

import { Begriff } from "../../_glossar/Begriff";

/** One line under the roles headings that explains every group role on tap.
 *  Pointless without the info points, so it follows the `glossar` flag. */
export function RollenLegende() {
  if (!isFlagOn("glossar")) return null;
  return (
    <p className="text-sm text-bdas-ink-body">
      Rollen in einer Gruppe: <Begriff k="lead">Lead</Begriff>,{" "}
      <Begriff k="event-manager">Event-Manager</Begriff>,{" "}
      <Begriff k="seiten-editor">Seiten-Editor</Begriff>,{" "}
      <Begriff k="datei-manager">Datei-Manager</Begriff>, <Begriff k="blogger">Blogger</Begriff>.
    </p>
  );
}
