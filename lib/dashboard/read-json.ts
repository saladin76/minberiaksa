/** Bounded, cancellable dashboard reads, including response-body decoding. */
export async function readDashboardJson<T>(url: string, signal: AbortSignal, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("DASHBOARD_READ_TIMEOUT")); }, timeoutMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok || body?.ok === false) throw new Error("DASHBOARD_READ_FAILED");
      return body as T;
    })()]);
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", abort);
  }
}
