/**
 * Maximum size of an explicitly selected campaign audience.
 *
 * The old 5,000 cap made "select all matching" unusable for real donor segments.
 * 100,000 is the operational target requested for campaign audiences and is
 * shared by the picker, list API and member writer so every layer agrees.
 *
 * Large selections are resolved and written in server-side batches; the UI
 * still receives only donor ids, not full donor records.
 */
export const AUDIENCE_SELECTION_MAX = 100_000;

/** Small database page used while resolving/writing very large audiences. */
export const AUDIENCE_SELECTION_PAGE = 2_000;
