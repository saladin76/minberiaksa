import type { ReactElement } from "react";

/**
 * Glyphs for the status screens. Every one is drawn, matched to its meaning —
 * the handoff's rule for icons across the site: no icon font, no emoji, and no
 * generic placeholder standing in for a specific state.
 */
const icon = (children: ReactElement, strokeWidth = 2) => (
  <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

/** A cross — the payment did not go through. */
export const FailIcon = icon(<path d="M18 6 6 18M6 6l12 12" />);

/** An arrow returning to its origin — the donor stepped back. */
export const CancelIcon = icon(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </>
);

/** A clock — the gateway is still working. */
export const ProcessingIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </>
);

/** A document under review — a transfer waiting on a finance officer. */
export const PendingIcon = icon(
  <>
    <path d="M7 3h10l2 2v16H5V5l2-2Z" />
    <path d="M9 12h6M9 16h4" />
    <circle cx="12" cy="8" r="1" />
  </>
);

/** A warning triangle — something broke on our side, not the donor's. */
export const TechErrorIcon = icon(
  <>
    <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </>
);

/** A wrench — planned maintenance, not a fault. */
export const MaintenanceIcon = icon(
  <path d="M14.7 6.3a4 4 0 0 1 5 5l-2-2-2 .6-.6 2-2-2Zm0 0L4.6 16.4a2 2 0 1 0 2.8 2.8L17.5 9.1" />
);

/** A crossed circle — the address does not exist. */
export const NotFoundIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m9.5 9.5 5 5m0-5-5 5" />
  </>,
  1.7
);

/** A check — the donation went through. */
export const SuccessIcon = icon(<path d="M20 6 9 17l-5-5" strokeWidth={2.4} />);
