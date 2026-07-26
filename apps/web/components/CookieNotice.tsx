"use client";

/**
 * Informational cookie notice (ADR 0008) — NOT a consent banner.
 *
 * The platform sets only the strictly-necessary session cookie (ADR 0002),
 * so § 25 (2) TTDSG requires information, not prior consent: there is no
 * accept/reject control. Dismissal is remembered in localStorage (functional
 * client state, not a cookie). Rendered only after mount so SSR markup and
 * the client agree (no hydration mismatch).
 *
 * When a non-essential cookie is introduced this becomes the upgrade point
 * to a true consent banner.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "bdas-cookie-notice";

export function CookieNotice({ privacyUrl }: { privacyUrl: string }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== "dismissed") setVisible(true);
    } catch {
      setVisible(true); // storage blocked → still inform
    }
  }, []);

  /**
   * Reserve the bar's height at the end of the document. Being `fixed`, it sits
   * over the page and takes no space of its own — so the last strip of every
   * page (on a phone that is the footer's own links) stayed permanently
   * underneath it, with nothing below to scroll into view. Measured rather than
   * hard-coded: the text wraps to a different height per viewport.
   */
  useEffect(() => {
    const el = ref.current;
    if (!visible || !el) return;
    const apply = () => {
      document.body.style.paddingBottom = `${el.offsetHeight}px`;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.body.style.paddingBottom = "";
    };
  }, [visible]);

  if (!visible) return null;

  function dismiss(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      /* ignore — notice just reappears next visit */
    }
    setVisible(false);
  }

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Cookie-Hinweis"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-bdas-soft bg-bdas-surface shadow-bdas-card"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4 text-sm text-bdas-ink-body sm:flex-row sm:items-center sm:justify-between">
        <p>
          Diese Seite verwendet ausschließlich technisch notwendige Cookies, um dich angemeldet zu
          halten. Mehr dazu in der{" "}
          <Link href={privacyUrl} className="text-bdas-red hover:underline">
            Datenschutzerklärung
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 self-start rounded-bdas-pill border border-bdas-soft px-4 py-1 text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-overlay-hover sm:self-auto"
        >
          Verstanden
        </button>
      </div>
    </div>
  );
}
