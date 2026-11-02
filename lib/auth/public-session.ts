import "server-only";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";

/** React cache is scoped to this render request, never shared across donors.
 * The public layout and homepage can await the same session read in parallel. */
export const getPublicServerSession = cache(() => getServerSession(authOptions));
