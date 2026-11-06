# Campaign send and WhatsApp PDF upload

- Live reproduction: confirming the latest email campaign navigated to its report; after refresh it remained DRAFT with no delivery records. No successful delivery is claimed.
- React portal clicks from confirmation dialogs reached the clickable campaign row. Isolated the entire actions subtree and made row navigation ignore portal and interactive targets.
- Cloudinary raw document uploads now use a unique signed public ID ending in .pdf. The browser submits exactly that signed ID; the legacy path also retains .pdf without filename collisions. This fixes a code path that could serve extensionless documents with an unexpected content type.
- Upload failures remain visible beside the file control. Missing template names focus the name input and show a persistent validation message; sample upload itself does not require a template name. Header changes are blocked during an upload.
- Verification: 3 focused tests passed (actual React portal click including approval/send order; PDF signature; actual editor upload function and retained Meta handle). The portal test fails on the old implementation and passes after the fix. Focused lint passed.
- Scope limits: the local source mirror is partial; a full production build and live Meta upload of the patched version must be verified after deployment. The live PDF sample attempt did not produce a confirmed Meta handle; the extension fix is not proof that all provider-side restrictions are resolved. No template was published to Meta and no donor message was sent by these tests.
