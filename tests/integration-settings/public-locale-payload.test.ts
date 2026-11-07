import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { LOCALE_FONT_STYLESHEETS } from "../../lib/locale-fonts";
import { pickNamespaces, SHELL_NAMESPACES, LEGACY_NAMESPACES } from "../../i18n/locale-messages";

for(const locale of SUPPORTED_LOCALES)test(`${locale}: public shell meets the translation payload budget while legacy copy remains available`,()=>{
 const shell=pickNamespaces(locale,SHELL_NAMESPACES),legacy=pickNamespaces(locale,[...SHELL_NAMESPACES,...LEGACY_NAMESPACES]);
 assert.ok(shell.Navbar&&shell.navigation&&shell.Concierge&&shell.CategoryNav);
 assert.equal(shell.Profile,undefined);assert.equal(shell.DonationSuccess,undefined);assert.ok(legacy.Profile&&legacy.DonationSuccess);
 const small=Buffer.from(JSON.stringify(shell)),large=Buffer.from(JSON.stringify(legacy));assert.ok(small.length<large.length*.6);assert.ok(gzipSync(small).length<16000,`${locale}: compressed shell exceeds 16 KB`);
});
for(const locale of ["ja","zh","hi"])test(`${locale}: versioned local font CSS retains modern Unicode subsets and never blocks on a late face`,()=>{
 const path=LOCALE_FONT_STYLESHEETS[locale]!;assert.ok(path.startsWith("/fonts/locales/"));const css=readFileSync("public"+path,"utf8");
 assert.ok(path.includes(createHash("sha256").update(css).digest("hex").slice(0,10)));assert.ok(css.includes("unicode-range:")&&css.includes("font-display: optional"));assert.equal(css.includes(".ttf"),false);assert.equal(css.includes("@import"),false);
 for(const match of css.matchAll(/url\(([^)]+)\)/g)){const url=new URL(match[1]);assert.equal(url.hostname,"fonts.gstatic.com");assert.ok(url.pathname.endsWith(".woff2"));}
});
