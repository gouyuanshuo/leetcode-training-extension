export const DATA_SCHEMA_VERSION = 2;
export const DATA_STORAGE_KEY = "lc-training:dataset";
export const FILTER_STORAGE_KEY = "lc-training:filters";
export const STATUS_SESSION_PREFIX = "lc-training:status";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export const RATING_URL =
  "https://raw.githubusercontent.com/zerotrac/leetcode_problem_rating/main/data.json";
export const LEVEL_URL =
  "https://raw.githubusercontent.com/zhang-wangz/LeetCodeRating/main/stormlevel/data.json";
export const STUDY_PLAN_BASE_URL =
  "https://huxulm.github.io/lc-rating/studyplan";

export const PLAN_KEYS = [
  "binary_search",
  "bitwise_operations",
  "data_structure",
  "dynamic_programming",
  "graph",
  "greedy",
  "grid",
  "math",
  "monotonic_stack",
  "sliding_window",
  "string",
  "trees"
] as const;

export type PlanKey = (typeof PLAN_KEYS)[number];

export const PLAN_TITLES: Record<PlanKey, { zh: string; en: string }> = {
  binary_search: { zh: "二分查找", en: "Binary Search" },
  bitwise_operations: { zh: "位运算", en: "Bitwise Operations" },
  data_structure: { zh: "数据结构", en: "Data Structures" },
  dynamic_programming: { zh: "动态规划", en: "Dynamic Programming" },
  graph: { zh: "图论算法", en: "Graph Algorithms" },
  greedy: { zh: "贪心", en: "Greedy" },
  grid: { zh: "网格图", en: "Grid Graphs" },
  math: { zh: "数学", en: "Mathematics" },
  monotonic_stack: { zh: "单调栈", en: "Monotonic Stack" },
  sliding_window: { zh: "滑动窗口", en: "Sliding Window and Two Pointers" },
  string: { zh: "字符串", en: "String Algorithms" },
  trees: { zh: "树和二叉树", en: "Linked Lists, Trees and Backtracking" }
};
