import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER_STATE,
  filterAndSortProblems,
  matchesRatingBucket,
  selectedProblemIds
} from "../src/shared/filters";
import type {
  NormalizedDataset,
  ProblemRecord,
  StudyNode
} from "../src/shared/types";

function problem(
  id: string,
  rating: number | null,
  title = `Problem ${id}`
): ProblemRecord {
  return {
    id,
    slug: `problem-${id}`,
    titleZh: `题目 ${id}`,
    titleEn: title,
    rating,
    arithmeticLevel: Number(id),
    difficulty: null,
    premium: false,
    directStudyNodeIds: []
  };
}

function node(
  id: string,
  parentId: string | null,
  children: string[],
  ids: string[]
): StudyNode {
  return {
    id,
    planKey: "binary_search",
    parentId,
    depth: parentId ? 1 : 0,
    titleZh: id,
    titleEn: id,
    untranslated: false,
    childIds: children,
    directProblemIds: [],
    allProblemIds: ids
  };
}

const dataset: NormalizedDataset = {
  schemaVersion: 1,
  problems: {
    "1": problem("1", 1199),
    "2": problem("2", 1200, "Alpha"),
    "3": problem("3", 1399),
    "4": problem("4", 1400),
    "5": problem("5", null)
  },
  problemIdBySlug: {},
  studyNodes: {
    root: node("root", null, ["left", "right"], ["1", "2", "3", "4"]),
    left: node("left", "root", [], ["1", "2"]),
    right: node("right", "root", [], ["3", "4"])
  },
  planRootIds: ["root"],
  timestamps: { rating: 0, level: 0, studyPlans: 0 }
};

describe("rating buckets", () => {
  it("uses exact inclusive/exclusive boundaries", () => {
    expect(matchesRatingBucket(1199, "lt1200")).toBe(true);
    expect(matchesRatingBucket(1200, "lt1200")).toBe(false);
    expect(matchesRatingBucket(1200, "1200-1399")).toBe(true);
    expect(matchesRatingBucket(1399, "1200-1399")).toBe(true);
    expect(matchesRatingBucket(1400, "1200-1399")).toBe(false);
    expect(matchesRatingBucket(2399, "2100-2399")).toBe(true);
    expect(matchesRatingBucket(2400, "gte2400")).toBe(true);
  });

  it("keeps unrated separate from numeric ranges", () => {
    expect(matchesRatingBucket(null, "unrated")).toBe(true);
    expect(matchesRatingBucket(0, "unrated")).toBe(true);
    expect(matchesRatingBucket(null, "all")).toBe(true);
    expect(matchesRatingBucket(0, "lt1200")).toBe(false);
    expect(matchesRatingBucket(null, "gte2400")).toBe(false);
  });
});

describe("topic and condition composition", () => {
  it("selecting a parent includes every descendant problem", () => {
    expect([...selectedProblemIds(dataset, ["root"])!]).toEqual([
      "1",
      "2",
      "3",
      "4"
    ]);
  });

  it("unions selected sections, then intersects the other filters", () => {
    const result = filterAndSortProblems(
      dataset,
      {
        ...DEFAULT_FILTER_STATE,
        selectedStudyNodeIds: ["left", "right"],
        ratingBucket: "1200-1399",
        status: "SOLVED",
        search: "alpha"
      },
      {
        "problem-2": "SOLVED",
        "problem-3": "SOLVED"
      },
      "en"
    );
    expect(result.map((item) => item.id)).toEqual(["2"]);
  });

  it("sorts unrated problems last in both directions", () => {
    for (const sortDirection of ["asc", "desc"] as const) {
      const result = filterAndSortProblems(
        dataset,
        { ...DEFAULT_FILTER_STATE, sortDirection },
        null,
        "en"
      );
      expect(result.at(-1)?.id).toBe("5");
    }
  });
});
