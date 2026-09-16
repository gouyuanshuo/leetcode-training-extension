import { describe, expect, it } from "vitest";
import { PLAN_KEYS, type PlanKey } from "../src/shared/config";
import {
  applyLevels,
  applyRatings,
  applyStudyPlans,
  createEmptyDataset
} from "../src/shared/normalize";
import type {
  LevelSourceRecord,
  RatingSourceRecord,
  StudyPlanProblem,
  StudyPlanRoot
} from "../src/shared/types";

describe("source ownership during normalization", () => {
  it("accepts ratings only from positive zerotrac records", () => {
    const records: RatingSourceRecord[] = Array.from(
      { length: 1000 },
      (_, index) => ({
        ID: index + 1,
        TitleSlug: `rating-problem-${index + 1}`,
        Rating: index === 0 ? 0 : 1200 + index
      })
    );

    const dataset = applyRatings(createEmptyDataset(), records);

    expect(dataset.problems["1"]).toBeUndefined();
    expect(dataset.problems["2"]?.rating).toBe(1201);
  });

  it("accepts arithmetic levels only from positive stormlevel records", () => {
    const records: LevelSourceRecord[] = Array.from(
      { length: 3000 },
      (_, index) => ({
        ID: index + 1,
        Url: `level-problem-${index + 1}`,
        Level: index === 0 ? 0 : (index % 10) + 1
      })
    );

    const dataset = applyLevels(createEmptyDataset(), records);

    expect(dataset.problems["1"]).toBeUndefined();
    expect(dataset.problems["2"]?.arithmeticLevel).toBe(2);
  });

  it("never treats study-plan score fields as contest ratings", () => {
    const referencedProblems: StudyPlanProblem[] = Array.from(
      { length: 2001 },
      (_, index) => ({
        id: index + 1,
        title: `${index + 1}. Problem ${index + 1}`,
        slug: `study-problem-${index + 1}`,
        score: index === 0 ? 0 : 1800
      })
    );

    const plans = Object.fromEntries(
      PLAN_KEYS.map((planKey, planIndex) => [
        planKey,
        {
          title: planKey,
          children: Array.from({ length: 25 }, (_, sectionIndex) => ({
            title: `Section ${sectionIndex + 1}`,
            problems:
              planIndex === 0 && sectionIndex === 0 ? referencedProblems : []
          }))
        }
      ])
    ) as Record<PlanKey, StudyPlanRoot>;

    const dataset = applyStudyPlans(createEmptyDataset(), plans, {});

    expect(dataset.problems["1"]?.rating).toBeNull();
    expect(dataset.problems["2"]?.rating).toBeNull();
  });
});
