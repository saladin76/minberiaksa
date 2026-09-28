import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * Paths that are not part of the application and must not be able to fail the lint gate.
 *
 * ESLint does not read tsconfig's `exclude`, so this list mirrors it. Everything here is either
 * generated, git-ignored scratch, or code that is imported by nothing and whose dependencies are not
 * installed - see the notes in tsconfig.json for each entry. They are deletion candidates, not code
 * to keep clean.
 */
const ignores = [
  ".next/**",
  ".integration-test-build/**",
  "node_modules/**",
  "tmp/**",
  "gozbebekleri/**",
  "public/**",
  "e2e/.artifacts/**",
  // Unreferenced, uncompilable leftovers.
  "components/ui/toast.tsx",
  "components/ui/toaster.tsx",
  "components/ui/calendar.tsx",
  "components/ui/slider.tsx",
  "lib/blog/pages/**",
  "**/_components/homepage/**",
  "**/blog/_components/_components/**",
  "**/blog/_components/wysiwyg/BlogEditorAR.jsx",
];

const eslintConfig = [
  { ignores },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    /* An eslint-disable for a rule this config does not enable is itself a finding: it documents a
       constraint that is not being enforced, and it hides nothing. Reported as an error so the gate
       catches one being added, since a suppression that lies is worse than no suppression. */
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
];

export default eslintConfig;
