"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { localeDirection } from "@/lib/locales";
import { miaPath, routeForPathname, type MinbarRoute } from "@/lib/minbar/routes";
import { useMinbarLabel } from "@/hooks/useMinbarLabel";

type Item = {
  route: MinbarRoute;
  labelKey: string;
  icon: "account" | "projects" | "video" | "home" | "waqf" | "recurring" | "zakat";
};

const ITEMS: readonly Item[] = [
  { route: "account", labelKey: "account", icon: "account" },
  { route: "projects", labelKey: "projects", icon: "projects" },
  { route: "achievementVideos", labelKey: "reports", icon: "video" },
  { route: "home", labelKey: "home", icon: "home" },
  { route: "waqf", labelKey: "waqf", icon: "waqf" },
  { route: "recurring", labelKey: "recurring", icon: "recurring" },
  { route: "zakat", labelKey: "zakat", icon: "zakat" },
];

function NavIcon({ name }: { name: Item["icon"] }) {
  const common = {
    width: 23,
    height: 23,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "account") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8.2" r="3.2" />
        <path d="M5 19a7 7 0 0 1 14 0" />
      </svg>
    );
  }
  if (name === "projects") {
    return (
      <svg {...common}>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
      </svg>
    );
  }
  if (name === "video") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m10 9 5 3-5 3V9Z" />
        <circle cx="18.2" cy="7.7" r="1.25" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === "home") {
    return (
      <svg {...common} width="24" height="24" strokeWidth="2">
        <path d="m3.5 10.5 8.5-7 8.5 7" />
        <path d="M5.5 9.5V20h13V9.5" />
        <path d="M9.5 20v-6h5v6" />
      </svg>
    );
  }
  if (name === "waqf") {
    return (
      <svg {...common}>
        <path d="M4 20h16" />
        <path d="M6 20V10h12v10" />
        <path d="M9 20v-6h6v6" />
        <path d="M5 10h14" />
        <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
        <path d="M12 3V1.8" />
      </svg>
    );
  }
  if (name === "recurring") {
    return (
      <svg {...common}>
        <path d="M20 7h-6V1" />
        <path d="M4.7 6.6A8 8 0 0 1 18.6 4L20 7" />
        <path d="M4 17h6v6" />
        <path d="M19.3 17.4A8 8 0 0 1 5.4 20L4 17" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 2.7c3.4 3.2 5.4 6.1 5.4 9.1A5.4 5.4 0 1 1 6.6 11.8c0-3 2-5.9 5.4-9.1Z" />
      <path d="M9.5 12.2h5" />
      <path d="M12 9.7v5" />
    </svg>
  );
}

export default function MobileBottomNav({ signedIn = false }: { signedIn?: boolean }) {
  const locale = useLocale();
  const pathname = usePathname();
  const label = useMinbarLabel();
  const dir = localeDirection(locale);
  const current = routeForPathname(pathname);

  const activeRoute: MinbarRoute | null =
    current === "projectDetail" ? "projects" : current === "donationSuccess" ? "home" : current;

  return (
    <nav className="mia-mobile-bottom-nav" dir={dir} aria-label={label("menu")}>
      <div className="mia-mobile-bottom-nav__inner">
        {ITEMS.map((item) => {
          const active = activeRoute === item.route;
          const isHome = item.route === "home";
          const href =
            item.route === "account" && !signedIn
              ? `/auth/signin?callbackUrl=${encodeURIComponent(miaPath("account", locale))}`
              : miaPath(item.route, locale);
          const ariaLabel = item.route === "achievementVideos" ? label("reports") : label(item.labelKey);

          return (
            <Link
              key={item.route}
              href={href}
              className={`mia-mobile-bottom-nav__item${active ? " is-active" : ""}${isHome ? " is-home" : ""}`}
              aria-label={ariaLabel}
              title={ariaLabel}
              aria-current={active ? "page" : undefined}
            >
              <span className="mia-mobile-bottom-nav__icon" aria-hidden="true">
                <NavIcon name={item.icon} />
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
