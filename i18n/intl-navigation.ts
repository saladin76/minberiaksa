import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing.config";

export const { Link: IntlLink, redirect, usePathname, useRouter } = createNavigation(routing);
