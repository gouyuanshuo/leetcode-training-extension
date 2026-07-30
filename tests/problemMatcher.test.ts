// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  problemFromHref,
  problemNearElement
} from "../src/content/problemMatcher";
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
    rating: 1200 + Number(id),
    arithmeticLevel: Number(id),
    difficulty: "EASY",
    premium: false,
    directStudyNodeIds: []
  };
}

const dataset: NormalizedDataset = {
  schemaVersion: 1,
  problems: {
    "1": problem("1", "two-sum"),
    "2": problem("2", "add-two-numbers")
  },
  problemIdBySlug: {
    "two-sum": "1",
    "add-two-numbers": "2"
  },
  studyNodes: {},
  planRootIds: [],
  timestamps: { rating: 1, level: 1, studyPlans: 1 }
};

function rect(
  element: Element,
  top: number,
  height = 20,
  width = 100
): void {
  element.getBoundingClientRect = () =>
    ({
      x: 0,
      y: top,
      top,
      bottom: top + height,
      left: 0,
      right: width,
      width,
      height,
      toJSON: () => ({})
    }) as DOMRect;
}

describe("problemset row matching", () => {
  it("resolves a standard row containing one problem link", () => {
    document.body.innerHTML = `
      <div class="row">
        <a href="https://leetcode.cn/problems/two-sum/">1. 两数之和</a>
        <span id="difficulty">简单</span>
      </div>
    `;
    const difficulty = document.querySelector("#difficulty")!;
    rect(difficulty, 100);
    rect(difficulty.parentElement!, 90, 60);
    expect(problemNearElement(dataset, difficulty)?.id).toBe("1");
  });

  it("matches a column-oriented grid by the closest horizontal row", () => {
    document.body.innerHTML = `
      <div class="list">
        <div class="titles">
          <a id="title-1" href="https://leetcode.cn/problems/two-sum/">1. 两数之和</a>
          <a id="title-2" href="https://leetcode.cn/problems/add-two-numbers/">2. 两数相加</a>
        </div>
        <div class="difficulties">
          <span id="difficulty-1">简单</span>
          <span id="difficulty-2">中等</span>
        </div>
      </div>
    `;
    const title1 = document.querySelector("#title-1")!;
    const title2 = document.querySelector("#title-2")!;
    const difficulty1 = document.querySelector("#difficulty-1")!;
    const difficulty2 = document.querySelector("#difficulty-2")!;
    rect(title1, 100);
    rect(difficulty1, 101);
    rect(title2, 170);
    rect(difficulty2, 171);
    rect(difficulty1.parentElement!, 80, 160);
    rect(difficulty1.parentElement!.parentElement!, 80, 160);

    expect(problemNearElement(dataset, difficulty1)?.id).toBe("1");
    expect(problemNearElement(dataset, difficulty2)?.id).toBe("2");
  });

  it("can fall back to a visible question number", () => {
    document.body.innerHTML = `
      <div id="row">2. 两数相加 <span id="difficulty">中等</span></div>
    `;
    const difficulty = document.querySelector("#difficulty")!;
    rect(difficulty, 100);
    rect(difficulty.parentElement!, 90, 60);
    expect(problemNearElement(dataset, difficulty)?.id).toBe("2");
  });

  it("normalizes a problem URL to the cached slug index", () => {
    expect(
      problemFromHref(
        dataset,
        "https://leetcode.cn/problems/two-sum/description/?envType=problem-list"
      )?.id
    ).toBe("1");
  });
});

