import { strict as assert } from "node:assert";
import { test, describe } from "node:test";

import {
  ageFromBirthdate,
  birthdateRangeForAges,
  formatBirthdateAr,
  genderQueryValues,
  normalizeGender,
  parseAgeParam,
  parseGenderParam,
} from "../../lib/dashboard/user-demographics";

/** Fixed "today" so the age maths is deterministic. */
const TODAY = new Date("2026-08-12T00:00:00.000Z");

describe("normalizeGender", () => {
  test("recognises every spelling the app writes", () => {
    for (const v of ["male", "Male", "MALE", "m", "ذكر"]) {
      assert.equal(normalizeGender(v), "male", `failed for ${v}`);
    }
    for (const v of ["female", "Female", "f", "أنثى", "انثى"]) {
      assert.equal(normalizeGender(v), "female", `failed for ${v}`);
    }
  });

  test("free text and preferNotToSay both land in undisclosed", () => {
    assert.equal(normalizeGender("preferNotToSay"), "undisclosed");
    assert.equal(normalizeGender("something else"), "undisclosed");
  });

  test("empty stays null so 'not recorded' is distinct from 'declined'", () => {
    assert.equal(normalizeGender(null), null);
    assert.equal(normalizeGender(undefined), null);
    assert.equal(normalizeGender("   "), null);
  });
});

describe("parseGenderParam", () => {
  test("'all' and empty mean no filter, not 'undisclosed'", () => {
    // normalizeGender("all") would return "undisclosed" — this is the whole
    // reason the param parser is separate.
    assert.equal(parseGenderParam("all"), null);
    assert.equal(parseGenderParam(""), null);
    assert.equal(parseGenderParam(null), null);
  });

  test("passes through the three real buckets", () => {
    assert.equal(parseGenderParam("male"), "male");
    assert.equal(parseGenderParam("female"), "female");
    assert.equal(parseGenderParam("undisclosed"), "undisclosed");
  });
});

describe("genderQueryValues", () => {
  test("male matches the spellings actually stored", () => {
    const v = genderQueryValues("male");
    assert.ok(v.includes("male"));
    assert.ok(v.includes("m"));
  });
  test("undisclosed covers preferNotToSay", () => {
    assert.ok(genderQueryValues("undisclosed").includes("preferNotToSay"));
  });
});

describe("ageFromBirthdate", () => {
  test("birthday already passed this year", () => {
    assert.equal(ageFromBirthdate("1990-05-04", TODAY), 36);
  });
  test("birthday not yet reached this year", () => {
    assert.equal(ageFromBirthdate("1990-12-25", TODAY), 35);
  });
  test("birthday is today", () => {
    assert.equal(ageFromBirthdate("1990-08-12", TODAY), 36);
  });
  test("day before birthday", () => {
    assert.equal(ageFromBirthdate("1990-08-13", TODAY), 35);
  });
  test("junk and empty give null rather than a bogus age", () => {
    assert.equal(ageFromBirthdate(null, TODAY), null);
    assert.equal(ageFromBirthdate("not a date", TODAY), null);
    assert.equal(ageFromBirthdate("1990/05/04", TODAY), null);
    assert.equal(ageFromBirthdate("1990-13-01", TODAY), null);
  });
});

describe("birthdateRangeForAges", () => {
  test("no bounds means no clause", () => {
    assert.equal(birthdateRangeForAges(null, null, TODAY), null);
  });

  test("min age only bounds the upper end of birthdate", () => {
    // age >= 25  <=>  born on or before 2001-08-12
    assert.deepEqual(birthdateRangeForAges(25, null, TODAY), { lte: "2001-08-12" });
  });

  test("max age only bounds the lower end of birthdate", () => {
    // age <= 34  <=>  born on or after 1991-08-13
    assert.deepEqual(birthdateRangeForAges(null, 34, TODAY), { gte: "1991-08-13" });
  });

  test("a bracket produces both bounds", () => {
    assert.deepEqual(birthdateRangeForAges(25, 34, TODAY), {
      gte: "1991-08-13",
      lte: "2001-08-12",
    });
  });

  /**
   * The bounds are what actually decide who gets a campaign, so check them
   * against the age function rather than trusting the arithmetic.
   */
  test("every boundary date agrees with ageFromBirthdate", () => {
    for (const [min, max] of [[25, 34], [35, 44], [45, 54], [18, 18]] as const) {
      const r = birthdateRangeForAges(min, max, TODAY)!;
      assert.equal(ageFromBirthdate(r.lte, TODAY), min, `lte of ${min}-${max}`);
      assert.equal(ageFromBirthdate(r.gte, TODAY), max, `gte of ${min}-${max}`);
    }
  });

  test("one day outside each bound falls out of the bracket", () => {
    const r = birthdateRangeForAges(25, 34, TODAY)!;
    const dayAfter = (iso: string) => {
      const d = new Date(`${iso}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    };
    const dayBefore = (iso: string) => {
      const d = new Date(`${iso}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    };
    assert.equal(ageFromBirthdate(dayAfter(r.lte!), TODAY), 24);
    assert.equal(ageFromBirthdate(dayBefore(r.gte!), TODAY), 35);
  });

  test("ISO strings sort lexicographically, which is what makes the range query work", () => {
    const r = birthdateRangeForAges(25, 34, TODAY)!;
    const inside = "1995-06-01";
    assert.ok(r.gte! <= inside && inside <= r.lte!);
    assert.ok(!("2010-01-01" <= r.lte!));
    assert.ok(!("1980-01-01" >= r.gte!));
  });
});

describe("parseAgeParam", () => {
  test("accepts sane integers", () => {
    assert.equal(parseAgeParam("0"), 0);
    assert.equal(parseAgeParam("34"), 34);
    assert.equal(parseAgeParam("130"), 130);
  });
  test("rejects junk instead of clamping it to 0", () => {
    for (const v of ["", "  ", null, undefined, "abc", "-1", "131", "3.5"]) {
      assert.equal(parseAgeParam(v), null, `failed for ${JSON.stringify(v)}`);
    }
  });
});

describe("formatBirthdateAr", () => {
  test("renders a readable Arabic month", () => {
    assert.equal(formatBirthdateAr("1990-05-04"), "4 مايو 1990");
  });
  test("junk gives null so the card shows a dash", () => {
    assert.equal(formatBirthdateAr("nope"), null);
    assert.equal(formatBirthdateAr(null), null);
  });
});
