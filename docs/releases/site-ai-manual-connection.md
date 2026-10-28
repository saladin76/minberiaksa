# Manual site AI connection

Adds the shared OpenAI connection card to `/dashboard/platform-connections/tracking#ai-connection`.

- A password input accepts a replacement key; blank preserves the effective key. The default model and site-wide enable switch are explicit. Removing the manual key also disables the connection and does not restore an older server key.
- The `AiConnectionSettings` MongoDB collection has one fixed `_id`. Encrypted credentials use the existing integration encryption key with a distinct AES-GCM context. Atomic revision checks reject concurrent changes. No schema migration or additional index is required.
- Before the first manual save, existing environment behavior is preserved, including content tools which historically did not use the core switch. After saving, the manual key and switch govern all existing AI consumers: assistant, analytics, marketing planning, archive, bank extraction, translations, SEO and editorial work. Dedicated content/research models are preserved.
- Saved secrets are never returned. Separate view/manage/test permissions protect the API. Testing draft credentials also requires management permission. The connection test reads model metadata only, without generation, persistence or donor content; it does not prove billing or generation readiness.
- Runtime reads the authoritative setting for new requests without changing process environment or needing a restart. In-flight requests may finish with their original configuration. Database/decryption failures do not fall back to a stale environment key.
- CLI AI/readiness diagnostics now use the effective saved connection, with no secret values in their report.

Validation includes encrypted storage and masking boundaries, blank preservation, global disable, clearing without fallback, concurrent saves, invalid inputs, controlled provider failures, authorization before reads/writes, test/save separation, existing editorial/translation suites, and AR/EN/TR browser states at desktop/390px/320px.

Production acceptance follows VPS deployment. No production key, provider configuration or saved content was changed while implementing this feature. No generation, donor message, payment or advertising action was executed.
