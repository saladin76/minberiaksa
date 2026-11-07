# Campaign link workspace — 2026-11-05

Base commit: `08284a15ab56126cc78118fda98cce4649ccd33b`.

## Result

The attribution page now separates creation from saved links/results with accessible hash-addressable tabs. Existing `#builder` and `#links` entry points remain usable and form/filter state survives tab switching. The permission-checked page and export capability are retained.

The builder presents destination, source and output with optional settings collapsed. A desktop side panel previews the result; the layout stacks at narrower breakpoints. Campaign names preserve non-Latin letters, and project links use canonical `/bagislar` paths. Unpublished resource choices are excluded. Failed data loading has an explicit retry action.

Direct sharing and automatic ad templates have different copy flows. For automatic templates, Website URL and URL Parameters are separate read-only/selectable fields with individual copy buttons. Placeholder braces remain literal in copied parameters. Preview opens only the destination. Saving-and-copying a template copies parameters, and the button names this behavior explicitly. Saved templates reopen the same separated settings instead of copying a combined template as a sharing link.

The observed `device_platform`/`publisher_platform` placeholders block new saves/copy in the builder and are rejected by POST before a registry write. Manual links with remaining dynamic placeholders require automatic mode or fixed values. This does not modify live ad campaigns or rewrite saved history.

Placeholder campaign/ad IDs are not saved as resolved registry identifiers. The raw template remains available for reuse. Descriptive notes retain their text. Success feedback clears when form values change. A save notifies the results panel to refresh.

Saved-link filters default to all platforms. The table has five primary columns; tracking reasons, recommendations and secondary actions remain expandable. Three summary cards count links rather than summing possibly overlapping donation/revenue matches. Per-link amounts remain visible with an overlap explanation; the financial matching service was not changed.

Arabic, English and Turkish copy is included in the existing dashboard catalogs. Inputs have associated labels, tab selection/keyboard navigation is supported, and export/edit/archive/restore/soft-delete remain available under the existing permissions and confirmations.

## Validation

- 75 focused tests passed: 8 link-workspace policy/API/catalog tests plus 67 preceding browser/payment/measurement regressions. The final resource-filter and SSR fallback refinements were followed by the 8 workspace tests and component bundle build.
- Changed-file lint including hooks and explicit-any/unused checks: zero errors.
- The actual client components were bundled with their existing UI primitives for browser QA against local fixture APIs. Arabic, English and Turkish rendered. Tested template saving, clipboard contents, existing-template settings, tab persistence, canonical project selection and disabled save/copy for the observed invalid placeholder. No production registry mutation, ad-platform request, bank operation or donor message was performed.
- Full application build and post-deployment live review remain release checks. Narrow-layout behavior is implemented with responsive CSS; no mobile-device measurement is claimed.
