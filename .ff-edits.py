import sys, json, re
def fail(m): print("⛔ " + m); sys.exit(1)
def edit(p, pairs):
    s = open(p, encoding="utf-8").read()
    for a, b in pairs:
        if s.count(a) != 1: fail(f"{p}: anchor ×{s.count(a)}: {a[:70]}")
        s = s.replace(a, b)
    open(p, "w", encoding="utf-8").write(s); print("✅ " + p)
# 1) iPhone: no blank homepage sections while scrolling
p = "styles/minbar/minbar.css"; s = open(p, encoding="utf-8").read()
if "iPhone content-visibility 2026-11-21" not in s:
    s += '''
/* iPhone content-visibility 2026-11-21: Safari on iPhone painted the homepage sections below the hero only after the
   scroll reached them, so a donor scrolling saw blank cream screens (mobile review). Chrome and Android keep the
   deferred rendering above (it is what lifted PageSpeed); iOS draws the sections normally. */
@supports (-webkit-touch-callout: none) {
  .mia-scope .mia-home > section:not(.mia-hero) { content-visibility: visible; }
}
'''
    open(p, "w", encoding="utf-8").write(s); print("✅ " + p)
# 2) dashboard on phones: fields at 16 px, so iPhone does not zoom into them
p = "styles/dashboard-utilities.css"; s = open(p, encoding="utf-8").read()
if "inputs 16px 2026-11-21" not in s:
    s += '''
/* inputs 16px 2026-11-21: iPhone zooms the page into any field under 16 px when it is tapped (21 dashboard fields
   in 11 files were 12–14 px). Phones only; computers keep the compact size. */
@media (max-width: 767px) {
  .dash-vivid input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
  .dash-vivid select, .dash-vivid textarea { font-size: 16px; }
}
'''
    open(p, "w", encoding="utf-8").write(s); print("✅ " + p)
# 3) account: a phone number reads left-to-right (+90… not …90+)
E = "app/[locale]/profile/_components/EditDialog.tsx"; es = open(E, encoding="utf-8").read()
if not re.search(r"\btype\b", es.split("return")[0]): fail("EditDialog has no type prop")
edit(E, [('''            {value || (
              <span className="text-gray-400 italic">{t("notSpecified")}</span>
            )}''', '''            {value ? (type === "tel" ? <bdi dir="ltr">{value}</bdi> : value) : (
              <span className="text-gray-400 italic">{t("notSpecified")}</span>
            )}''')])
# 4) "حصلت على 2 وسامًا" → Arabic plural forms
A = "i18n/messages/ar.json"; a = open(A, encoding="utf-8").read()
old = '"badgesEarned": "حصلت على {count} وسامًا"'
if a.count(old) != 1: fail("badgesEarned")
a = a.replace(old, '"badgesEarned": "{count, plural, =0 {لم تحصل على أوسمة بعد} one {حصلت على وسام واحد} two {حصلت على وسامين} few {حصلت على # أوسمة} many {حصلت على # وسامًا} other {حصلت على # وسام}}"')
json.loads(a); open(A, "w", encoding="utf-8").write(a); print("✅ " + A)
# 5) inbox: a contact saved as "." shows its number
W = "app/(dashboard)/dashboard/communication/conversations/_components/ConversationsWorkspace.tsx"; w = open(W, encoding="utf-8").read()
a1 = 'const initials = (c: Conversation) => (c.name || c.phone).replace'
if w.count(a1) != 1: fail("initials")
w = w.replace(a1, '''/** A name with no letter in it (".", "-", "?") is not a name: show the number (mobile review, 2026-11-21). */
const displayName = (c: Conversation): string => (c.name && /\\p{L}/u.test(c.name) ? c.name : c.phone);
const initials = (c: Conversation) => displayName(c).replace''')
for o, n in [("{c.name || c.phone}", "{displayName(c)}"), ("{active.name || active.phone}", "{displayName(active)}"), ("active.name || active.phone]", "displayName(active)]")]:
    if w.count(o) != 1: fail(f"inbox anchor ×{w.count(o)}: {o}")
    w = w.replace(o, n)
open(W, "w", encoding="utf-8").write(w); print("✅ " + W)
