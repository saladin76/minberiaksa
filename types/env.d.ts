declare namespace NodeJS {
  /**
   * Every variable here is optional, because at runtime every one of them genuinely can be absent —
   * a preview deployment without the Facebook app configured, a script run outside Vercel, a test
   * that builds a two-key env on purpose. Declaring them required did not make them present; it only
   * made TypeScript insist they were, so `process.env.DATABASE_URL` typed as `string` while the code
   * around it correctly guarded for `undefined`, and any partial env literal was rejected outright.
   * The guards are the truth; this now matches them.
   */
  interface ProcessEnv {
    DATABASE_URL?: string;
    NEXTAUTH_URL?: string;
    NEXTAUTH_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    FACEBOOK_CLIENT_ID?: string;
    FACEBOOK_CLIENT_SECRET?: string;
    NODE_ENV: 'development' | 'production' | 'test';
    /** Meta CAPI (server) — same pixel id as browser for deduplication */
    META_PIXEL_ID?: string;
    META_ACCESS_TOKEN?: string;
    /** GA4 Measurement Protocol (server) */
    GA4_MEASUREMENT_ID?: string;
    GA4_API_SECRET?: string;
  }
}

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}