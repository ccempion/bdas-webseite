import { isFlagOn } from "@bdas/feature-flags";

import { loadCurrentMember } from "./_dashboard/session";
import { AgBlock } from "./_public/landing/AgBlock";
import { AktuellesBlock } from "./_public/landing/AktuellesBlock";
import { ConnectBlock } from "./_public/landing/ConnectBlock";
import { GruppenBlock } from "./_public/landing/GruppenBlock";
import { Hero } from "./_public/landing/Hero";
import { KalenderBlock } from "./_public/landing/KalenderBlock";
import { LegacyLanding } from "./_public/landing/LegacyLanding";

export default async function HomePage() {
  if (!isFlagOn("public_shell")) return <LegacyLanding />;

  const me = await loadCurrentMember();
  const loggedIn = me !== null;
  const hasGroup = me?.member?.primaryGroupId != null;
  return (
    <main className="flex flex-col">
      <Hero loggedIn={loggedIn} hasGroup={hasGroup} />
      {isFlagOn("groups") ? <GruppenBlock /> : null}
      <AktuellesBlock />
      {isFlagOn("events") ? <KalenderBlock /> : null}
      <AgBlock />
      <ConnectBlock loggedIn={loggedIn} />
    </main>
  );
}
