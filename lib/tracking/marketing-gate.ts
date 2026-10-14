/**
 * When the public site's marketing scripts (GTM and its tags, the Meta, TikTok
 * and GA pixels, Contentsquare) may load: on the visitor's first real
 * interaction, or a short while after the page has finished loading and the
 * main thread is idle  whichever comes first.
 *
 * Each loader used to keep its own rule (a 6 s timer from mount, a `scroll`
 * listener that also fired for scrolls the page makes itself, and a bootstrap
 * that dispatched a fake `pointerdown` straight after hydration). Together they
 * put ~2.5 s of third-party script into the page's first seconds, which was
 * most of PageSpeed's Total Blocking Time. One gate, one rule.
 *
 * Conversion pages bypass this: their loaders fire at once (see callers).
 */

/** How long after `load` (plus an idle moment) a visitor who never interacts gets the scripts. */
export const MARKETING_FALLBACK_DELAY_MS = 4000;

const INTERACTIONS = ["pointerdown", "keydown", "touchstart", "wheel"] as const;

let opened = false;
let started = false;
const waiting: Array<() => void> = [];

function open() {
  if (opened) return;
  opened = true;
  for (const event of INTERACTIONS) window.removeEventListener(event, onInteraction, true);
  for (const cb of waiting.splice(0)) {
    try {
      cb();
    } catch (e) {
      console.error("marketing-gate callback:", e);
    }
  }
}

function onInteraction(event: Event) {
  // A synthetic event dispatched by script is not a visitor.
  if (event.isTrusted) open();
}

function start() {
  if (started) return;
  started = true;
  for (const event of INTERACTIONS) window.addEventListener(event, onInteraction, { capture: true, passive: true });

  const afterLoad = () => {
    window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(open, { timeout: 2000 });
      else open();
    }, MARKETING_FALLBACK_DELAY_MS);
  };
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
}

/** Runs `cb` once the gate opens (at once if it already has). Browser only. */
export function whenMarketingAllowed(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (opened) {
    cb();
    return () => {};
  }
  waiting.push(cb);
  start();
  return () => {
    const i = waiting.indexOf(cb);
    if (i >= 0) waiting.splice(i, 1);
  };
}
