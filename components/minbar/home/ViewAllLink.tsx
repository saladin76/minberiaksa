import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowGlyph } from "./TopSections";

/**
 * The one "see all of these" link every homepage section uses beside its
 * heading. Before this, the sections had four different treatments for the
 * same job — a red text link, a bordered button, a pill and an inline arrow
 * link — which read as four different levels of importance for one action.
 */
export default function ViewAllLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mia-pill-link mia-viewall">
      {children}
      <ArrowGlyph size={13} />
    </Link>
  );
}
