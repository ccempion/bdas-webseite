/**
 * The BDAS brand lockup — logo mark + wordmark — linking home. Shared by the
 * public shell and the standalone dashboard so both headers carry one identity.
 */
import Image from "next/image";
import Link from "next/link";
import React from "react";

import logo from "../public/bdas-logo.png";

export function BrandLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="BDAS — zur Startseite"
      className={`flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:text-bdas-red ${className}`}
    >
      <Image src={logo} alt="" priority className="h-9 w-auto" />
      <span>BDAS</span>
    </Link>
  );
}
