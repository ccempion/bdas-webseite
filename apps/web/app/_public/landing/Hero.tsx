import Link from "next/link";

import { HeroSlideshow } from "./HeroSlideshow";

export function Hero() {
  return (
    <HeroSlideshow>
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16">
        <h1 className="max-w-2xl text-4xl font-semibold text-white sm:text-5xl">
          Bund der Alevitischen Studierenden in Deutschland
        </h1>
        {/* Platzhalter-Tagline — finaler Satz kommt vom Bundesvorstand (Spec §8). */}
        <p className="max-w-xl text-lg text-white/90">
          Alevitische Studierende an deutschen Hochschulen — vernetzt, sichtbar, gemeinsam.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/#gruppen"
            className="inline-flex items-center rounded-bdas bg-bdas-red px-5 py-2.5 font-medium text-white transition-colors duration-bdas-quick ease-bdas hover:brightness-110"
          >
            Finde deine Gruppe
          </Link>
          <Link
            href="/registrieren"
            className="inline-flex items-center rounded-bdas border border-bdas-strong bg-bdas-surface px-5 py-2.5 font-medium text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-hover"
          >
            Mitglied werden
          </Link>
        </div>
      </div>
    </HeroSlideshow>
  );
}
