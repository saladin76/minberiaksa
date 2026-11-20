/**
 * WhatsApp inbox alerts in the dashboard (owner decision, 2026-11-18): a short sound, a browser notification
 * when the dashboard tab is in the background, and the unread count in the tab title. Per staff member and
 * device (localStorage), on by default; browser notifications only after the browser grants permission.
 */
const PREF_KEY = "mia-inbox-alerts";
const TITLE_PREFIX = /^\(\d+\+?\)\s+/;

export function inboxAlertsEnabled(): boolean {
  try { return typeof window !== "undefined" && window.localStorage.getItem(PREF_KEY) !== "off"; } catch { return true; }
}
export function setInboxAlertsEnabled(on: boolean): void {
  try { window.localStorage.setItem(PREF_KEY, on ? "on" : "off"); } catch { /* private mode */ }
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}
export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (notificationPermission() === "unsupported") return "unsupported";
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

/** "(3) Dashboard" while there are unread conversations; the plain title otherwise. */
export function setInboxTitleCount(count: number): void {
  if (typeof document === "undefined") return;
  const base = document.title.replace(TITLE_PREFIX, "");
  document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${base}` : base;
}

function chime(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    for (const [freq, at] of [[880, 0], [1320, 0.12]] as const) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at); osc.stop(now + at + 0.25);
    }
    setTimeout(() => { void ctx.close().catch(() => undefined); }, 600);
  } catch { /* autoplay policy or no audio: the badge and title still show it */ }
}

/** Called with the previous and the new unread total; alerts only when it grows (never on the first read). */
export function alertOnNewInboxMessages(previous: number | null, next: number, text: { title: string; body: string; href: string }): void {
  if (previous === null || next <= previous || !inboxAlertsEnabled()) return;
  chime();
  if (notificationPermission() === "granted" && typeof document !== "undefined" && document.hidden) {
    try {
      const n = new Notification(text.title, { body: text.body, tag: "mia-inbox", icon: "/minbar/assets/logo-mark.png" });
      n.onclick = () => { window.focus(); window.location.assign(text.href); n.close(); };
    } catch { /* some browsers only allow notifications from a service worker */ }
  }
}
