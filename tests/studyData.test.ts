import { describe, expect, it } from "vitest";
import translations from "../src/data/studyTranslations.en.json";
import snapshot from "../src/data/studyHeadings.snapshot.json";
import { normalizeSlug } from "../src/shared/normalize";

describe("bundled Lingcha study-plan snapshot", () => {
  it("covers every current section with an English translation", () => {
    expect(snapshot.headings.length).toBeGreaterThanOrEqual(393);
    expect(Object.keys(translations)).toHaveLength(snapshot.headings.length);
    for (const heading of snapshot.headings) {
      expect(translations[heading.key as keyof typeof translations]?.trim()).toBeTruthy();
    }
  });

  it("contains all 12 plans and 3192 valid problem references", () => {
    const plans = new Set(
      snapshot.headings.map((heading) => heading.key.split("::")[0])
    );
    expect(plans.size).toBe(12);
    expect(snapshot.problemRefs).toHaveLength(3192);
    for (const reference of snapshot.problemRefs) {
      // LeetCode also uses IDs such as LCP 08, LCR 114 and interview IDs.
      expect(reference.id.trim()).not.toBe("");
      expect(normalizeSlug(reference.slug)).toMatch(
        /^[A-Za-z0-9][A-Za-z0-9-]*$/
      );
      expect(
        snapshot.headings.some((heading) => heading.key === reference.sectionKey)
      ).toBe(true);
    }
  });

  it("can deduplicate references by problem ID and slug", () => {
    const pairs = new Set(
      snapshot.problemRefs.map((reference) => `${reference.id}:${reference.slug}`)
    );
    const ids = new Set(snapshot.problemRefs.map((reference) => reference.id));
    const slugs = new Set(snapshot.problemRefs.map((reference) => reference.slug));
    expect(pairs.size).toBeLessThan(snapshot.problemRefs.length);
    expect(ids.size).toBeGreaterThan(2000);
    expect(slugs.size).toBeGreaterThan(2000);
  });
});
