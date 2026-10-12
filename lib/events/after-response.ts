import { after } from "next/server";

/**
 * Runs donor notifications (receipt PDFs, email, WhatsApp, CAPI) after the
 * response is sent, without letting the platform freeze them halfway.
 *
 * A bare `void promise` after the response works on a long-running Node server
 * but not on Vercel, which may suspend the function as soon as the response
 * leaves — and receipt generation alone can take tens of seconds. `after()`
 * keeps the function alive until the task settles. Outside a request (a script,
 * a test) `after()` throws, so the task then simply runs detached.
 */
export function runAfterResponse(task: () => Promise<unknown>): void {
  const guarded = () =>
    task().catch((error) => {
      console.error("[after-response] task failed:", error instanceof Error ? error.message : String(error));
    });
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
