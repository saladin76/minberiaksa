/**
 * "It went into the basket, and the basket is up there."
 *
 * A donor who adds from a card is still on the listing, so the add has to
 * point somewhere: a gold coin flies from the button they pressed to the
 * header's basket, and the basket answers with a bump (`CART_BUMP_EVENT`,
 * which the header listens for). With reduced motion, or when the header's
 * basket is not on screen, the flight is skipped and only the bump is sent.
 */

export const CART_BUMP_EVENT = "mia:cart-bump";

/** Marks the header's basket link as the coin's landing point. */
export const CART_TARGET_ATTR = "data-mia-cart";

export function bumpCart(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CART_BUMP_EVENT));
}

export function flyToCart(from: DOMRect | HTMLElement | null): void {
  if (typeof window === "undefined") return;
  const target = document.querySelector<HTMLElement>(`[${CART_TARGET_ATTR}]`);
  const start = from instanceof HTMLElement ? from.getBoundingClientRect() : from;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const end = target?.getBoundingClientRect();

  if (!start || !end || reduced || end.bottom < 0 || end.width === 0 || typeof document.body.animate !== "function") {
    bumpCart();
    return;
  }

  const size = 30;
  const x0 = start.left + start.width / 2 - size / 2;
  const y0 = start.top + start.height / 2 - size / 2;
  const dx = end.left + end.width / 2 - size / 2 - x0;
  const dy = end.top + end.height / 2 - size / 2 - y0;
  /* The arc's peak sits above the higher of the two points. */
  const lift = Math.min(dy, 0) - 90;

  const coin = document.createElement("span");
  coin.setAttribute("aria-hidden", "true");
  coin.innerHTML =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#10212B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 8 2 11h12l2-11H4Z"/><path d="m9 8 3-4 3 4"/></svg>';
  Object.assign(coin.style, {
    position: "fixed",
    left: `${x0}px`,
    top: `${y0}px`,
    width: `${size}px`,
    height: `${size}px`,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    background: "radial-gradient(circle at 35% 30%, #F4D58A, #D39A27 60%, #B8811C)",
    boxShadow: "0 0 0 3px rgba(211,154,39,.35), 0 10px 24px rgba(211,154,39,.55)",
    zIndex: "400",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(coin);

  const flight = coin.animate(
    [
      { transform: "translate(0, 0) scale(.6) rotate(0deg)", opacity: 0 },
      { transform: "translate(0, -14px) scale(1.25) rotate(-20deg)", opacity: 1, offset: 0.12 },
      { transform: `translate(${dx * 0.5}px, ${lift}px) scale(1.1) rotate(160deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.45) rotate(360deg)`, opacity: 0.9 },
    ],
    { duration: 820, easing: "cubic-bezier(.45,.05,.35,1)", fill: "forwards" }
  );
  const land = () => {
    coin.remove();
    bumpCart();
  };
  flight.onfinish = land;
  flight.oncancel = land;
}
