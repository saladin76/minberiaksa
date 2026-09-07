declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    NEXTAUTH_URL: string;
    NEXTAUTH_SECRET: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    FACEBOOK_CLIENT_ID: string;
    FACEBOOK_CLIENT_SECRET: string;
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