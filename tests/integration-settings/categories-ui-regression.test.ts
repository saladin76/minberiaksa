import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("category row actions have contextual accessible names", () => {
  const source = readFileSync("app/(dashboard)/dashboard/categories/page.tsx", "utf8");
  for (const action of [
    "ترتيب المشاريع داخل التصنيف: {0}",
    "تعديل التصنيف: {0}",
    "أرشفة التصنيف: {0}",
    "حذف التصنيف: {0}",
  ]) {
    assert.ok(source.includes(`aria-label={dt("${action}"`), `missing accessible label for ${action}`);
  }
});

test("category archive success message does not claim projects were changed", () => {
  const source = readFileSync("app/(dashboard)/dashboard/categories/page.tsx", "utf8");
  assert.match(source, /تم أرشفة التصنيف دون تغيير حالة المشاريع التابعة/);
  assert.match(source, /تم تفعيل التصنيف دون تغيير حالة المشاريع التابعة/);
  assert.doesNotMatch(source, /cascadedCampaigns/);
});

test("category empty states and create action name the category entity correctly", () => {
  const source = readFileSync("app/(dashboard)/dashboard/categories/page.tsx", "utf8");
  assert.match(source, /title={dt\("لا توجد تصنيفات"\)}/);
  assert.match(source, /لا توجد تصنيفات تطابق التصفية الحالية/);
  assert.match(source, /dt\("إضافة تصنيف جديد"\)/);
  assert.match(source, /dt\("لا توجد تصنيفات في الأرشيف"\)/);
});
