"use client";

/**
 * Renders the official Google Identity Services (GSI) "Sign in with Google"
 * button. GSI uses Google's modern token flow (FedCM where supported, popup
 * elsewhere), which works in browsers and contexts where the legacy OAuth
 * redirect flow is blocked with "This browser or app may not be secure".
 *
 * On user pick, GSI returns a JWT ID token; we send it to the
 * `google-onetap` NextAuth credentials provider, which verifies it
 * server-side via google-auth-library and creates/returns the session.
 *
 * If GSI fails to load (CSP, network, etc.) we fall back to the legacy
 * `signIn("google", ...)` redirect flow so users are never stranded.
 */

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";

/**
 * Lightweight UA-based detection of common in-app browsers (Instagram,
 * Facebook, TikTok, LinkedIn, etc.) and generic Android WebViews. Google's
 * gsi/client script and FedCM are commonly blocked or broken in these
 * contexts, so we skip GSI and surface the legacy redirect path immediately.
 */
function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (!ua) return false;
  if (
    /FB_IAB|FBAN|FBAV|FB4A|FBIOS|Instagram|TikTok|musical_ly|BytedanceWebview|LinkedInApp|Snapchat|Line\/|MicroMessenger|WeChat|KAKAOTALK|Pinterest/i.test(
      ua
    )
  ) {
    return true;
  }
  if (/Android/i.test(ua) && /; wv\)/.test(ua)) return true;
  if (
    /iPhone|iPad|iPod/i.test(ua) &&
    / Mobile\//.test(ua) &&
    !/ Safari\//.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)
  ) {
    return true;
  }
  return false;
}

type GsiCredentialResponse = { credential: string };

type GsiId = {
  initialize: (config: {
    client_id: string;
    callback: (resp: GsiCredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      logo_alignment?: "left" | "center";
      width?: number | string;
      locale?: string;
    }
  ) => void;
  prompt: () => void;
  disableAutoSelect: () => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";
const SCRIPT_ATTR = "data-gsi-client";
let gsiScriptPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;

  gsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_ATTR}="1"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("gsi_script_error")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.setAttribute(SCRIPT_ATTR, "1");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gsi_script_error"));
    document.head.appendChild(s);
  });
  return gsiScriptPromise;
}

let cachedClientId: string | null = null;
async function fetchClientId(): Promise<string | null> {
  if (cachedClientId) return cachedClientId;
  try {
    const res = await fetch("/api/auth/google-config", { cache: "force-cache" });
    if (!res.ok) return null;
    const data = (await res.json()) as { clientId?: string };
    if (data.clientId) cachedClientId = data.clientId;
    return cachedClientId;
  } catch {
    return null;
  }
}

interface Props {
  /** URL to navigate to after successful sign-in. Ignored when `onAuthenticated` is provided. */
  callbackUrl?: string;
  /**
   * Called after the session has been established. When provided, the button
   * stays on the current page and hands control back to the parent (mirrors
   * the email-credentials flow used by SignInDialog). This is what lets a
   * caller like DonationDialog advance an in-progress wizard step instead of
   * navigating away and re-mounting via sessionStorage.
   */
  onAuthenticated?: () => void;
  /** Locale code passed to the GSI button (e.g. "en", "tr", "ar"). */
  locale?: string;
  /** Width of the rendered button (px). Defaults to 320. */
  width?: number;
  /** Optional class on the wrapper. */
  className?: string;
  /** Theme of the official button. */
  theme?: "outline" | "filled_blue" | "filled_black";
  /** Text on the official button. */
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  /** Called on auth failure (verification rejected, network, etc.). */
  onError?: (e: unknown) => void;
  /** Called when GSI cannot be loaded; receives a `triggerFallback()` callback. */
  fallbackRender?: (triggerFallback: () => void) => React.ReactNode;
}

export default function GoogleSignInButton({
  callbackUrl,
  onAuthenticated,
  locale,
  width = 320,
  className,
  theme = "outline",
  text = "signin_with",
  onError,
  fallbackRender,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [submitting, setSubmitting] = useState(false);

  // Fallback path used when GSI can't load OR when the user is in an in-app
  // browser where popups are unreliable. Hands off to the legacy redirect
  // OAuth flow — the existing in-app browser notice will catch webviews.
  const triggerFallback = () => {
    signIn("google", { callbackUrl });
  };

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      try {
        // In-app browsers: skip GSI (popups are blocked / FedCM unavailable).
        if (isInAppBrowser()) {
          if (!cancelled) setStatus("fallback");
          return;
        }

        const [, clientId] = await Promise.all([loadGsiScript(), fetchClientId()]);
        if (cancelled) return;

        if (!clientId || !window.google?.accounts?.id || !hostRef.current) {
          setStatus("fallback");
          return;
        }

        const gsi = window.google.accounts.id;
        gsi.initialize({
          client_id: clientId,
          ux_mode: "popup",
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
          callback: async (resp) => {
            if (!resp?.credential) return;
            setSubmitting(true);
            try {
              const result = await signIn("google-onetap", {
                idToken: resp.credential,
                redirect: false,
              });
              if (result?.error) {
                onError?.(new Error(result.error));
                setSubmitting(false);
                return;
              }
              // If the caller wants to keep the user in place (e.g. an open
              // wizard like DonationDialog), hand control back. Otherwise
              // navigate to callbackUrl so standalone pages still work.
              if (onAuthenticated) {
                onAuthenticated();
                setSubmitting(false);
                return;
              }
              if (typeof window !== "undefined") {
                window.location.href = callbackUrl || "/";
              }
            } catch (e) {
              setSubmitting(false);
              onError?.(e);
            }
          },
        });

        const renderInto = () => {
          if (!hostRef.current) return;
          // Measure the host's actual rendered width so the GSI iframe
          // matches the container. Google clamps width to [200, 400].
          const measured = hostRef.current.clientWidth;
          const target = Math.max(220, Math.min(400, measured || width));
          hostRef.current.innerHTML = "";
          gsi.renderButton(hostRef.current, {
            type: "standard",
            theme,
            size: "large",
            text,
            shape: "rectangular",
            logo_alignment: "center",
            width: target,
            ...(locale ? { locale } : {}),
          });
        };
        renderInto();
        setStatus("ready");

        // Re-render on container width change (responsive layouts) — but only
        // when the width meaningfully changes, to avoid an infinite RO loop
        // that fires on every iframe paint.
        if (typeof ResizeObserver !== "undefined" && hostRef.current) {
          let lastWidth = hostRef.current.clientWidth;
          resizeObserver = new ResizeObserver(() => {
            if (!hostRef.current) return;
            const w = hostRef.current.clientWidth;
            if (Math.abs(w - lastWidth) >= 4) {
              lastWidth = w;
              renderInto();
            }
          });
          resizeObserver.observe(hostRef.current);
        }
      } catch {
        if (!cancelled) setStatus("fallback");
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
  }, [callbackUrl, onAuthenticated, locale, theme, text, width, onError]);

  if (status === "fallback") {
    if (fallbackRender) return <>{fallbackRender(triggerFallback)}</>;
    return (
      <button
        type="button"
        onClick={triggerFallback}
        className={`flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 ${className ?? ""}`}
      >
        <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C33.6 6.5 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C33.6 6.5 29 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c4.9 0 9.4-1.9 12.7-5l-5.9-5c-1.9 1.4-4.4 2.3-6.8 2.3-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2.1-2.1 3.9-3.9 5.1l5.9 5c4.1-3.8 6.7-9.4 6.7-15.6 0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        <span>Sign in with Google</span>
      </button>
    );
  }

  return (
    <div className={`relative w-full ${className ?? ""}`}>
      <div
        ref={hostRef}
        className="flex w-full items-center justify-center min-h-[44px]"
        aria-busy={status === "loading"}
      />
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#A5243D]" />
        </div>
      )}
      {submitting && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-sm">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#A5243D]" />
        </div>
      )}
    </div>
  );
}
