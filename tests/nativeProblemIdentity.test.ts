// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  problemFromHref,
  resolveProblemForElement
} from "../src/content/nativeProblemIdentity";
import type {
  NormalizedDataset,
  ProblemRecord
} from "../src/shared/types";

function problem(id: string, slug: string): ProblemRecord {
  return {
    id,
    slug,
    titleZh: id,
    titleEn: id,
    rating: null,
    arithmeticLevel: null,
    difficulty: null,
    premium: false,
    directStudyNodeIds: []
  };
}

const dataset: NormalizedDataset = {
  schemaVersion: 1,
  problems: {
    "1": problem("1", "two-sum"),
    "2": problem("2", "add-two-numbers"),
    "LCP 08": problem("LCP 08", "ju-qing-hong-fa-shi-jian")
  },
  problemIdBySlug: {
    "two-sum": "1",
    "add-two-numbers": "2",
    "ju-qing-hong-fa-shi-jian": "LCP 08"
  },
  studyNodes: {},
  planRootIds: [],
  timestamps: { rating: 1, level: 1, studyPlans: 1 }
};

describe("native LeetCode problem identity", () => {
  it("uses a problem link when the row contains one", () => {
    document.body.innerHTML = `
      <div class="row">
        <a href="https://leetcode.cn/problems/two-sum/">1. 两数之和</a>
        <span id="difficulty" class="text-sd-easy">简单</span>
      </div>
    `;
    expect(
      resolveProblemForElement(
        dataset,
        document.querySelector("#difficulty")!
      )?.id
    ).toBe("1");
  });

  it("uses the single question number in a link-free row", () => {
    document.body.innerHTML = `
      <div class="row">
        <span>2. 两数相加</span>
        <span id="difficulty" class="text-sd-medium">中等</span>
      </div>
    `;
    expect(
      resolveProblemForElement(
        dataset,
        document.querySelector("#difficulty")!
      )?.id
    ).toBe("2");
  });

  it("supports LCP IDs used in study-plan rows", () => {
    document.body.innerHTML = `
      <div class="study-row">
        <span>LCP 08. 剧情触发时间</span>
        <span id="difficulty" class="text-lc-yellow-60">中等</span>
      </div>
    `;
    expect(
      resolveProblemForElement(
        dataset,
        document.querySelector("#difficulty")!
      )?.id
    ).toBe("LCP 08");
  });

  it("does not guess after reaching a container with multiple questions", () => {
    document.body.innerHTML = `
      <div class="list">
        <span>1. 两数之和</span><span>2. 两数相加</span>
        <span id="difficulty" class="text-sd-easy">简单</span>
      </div>
    `;
    expect(
      resolveProblemForElement(
        dataset,
        document.querySelector("#difficulty")!
      )
    ).toBeNull();
  });

  it("normalizes problem URLs through the cached slug index", () => {
    expect(
      problemFromHref(
        dataset,
        "https://leetcode.cn/problems/two-sum/description/"
      )?.id
    ).toBe("1");
  });
});

