import { redirect } from "next/navigation";

/** The archive dashboard was retired. Old bookmarks return to the dashboard.
 * Protected legacy APIs and records remain available for compatibility.
 */
export default function RetiredArchiveRoute() {
  redirect("/dashboard");
}
