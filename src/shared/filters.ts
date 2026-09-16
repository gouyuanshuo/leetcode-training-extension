import type {
  FilterState,
  NormalizedDataset,
  ProblemRecord,
  ProblemStatus,
  RatingBucket
} from "./types";

export const DEFAULT_FILTER_STATE: FilterState = {
  ratingBucket: "all",
  selectedStudyNodeIds: [],
  status: "all",
  search: "",
  sortKey: "rating",
  sortDirection: "asc"
};

export function matchesRatingBucket(
  rating: number | null,
  bucket: RatingBucket
): boolean {
  if (bucket === "all") return true;
  if (bucket === "unrated") {
    return rating == null || !Number.isFinite(rating) || rating <= 0;
  }
  if (rating == null || !Number.isFinite(rating) || rating <= 0) return false;

  switch (bucket) {
    case "lt1200":
      return rating >= 1 && rating < 1200;
    case "1200-1399":
      return rating >= 1200 && rating < 1400;
    case "1400-1599":
      return rating >= 1400 && rating < 1600;
    case "1600-1899":
      return rating >= 1600 && rating < 1900;
    case "1900-2099":
      return rating >= 1900 && rating < 2100;
    case "2100-2399":
      return rating >= 2100 && rating < 2400;
    case "gte2400":
      return rating >= 2400;
  }
}

export function selectedProblemIds(
  dataset: NormalizedDataset,
  nodeIds: string[]
): Set<string> | null {
  if (nodeIds.length === 0) return null;
  const ids = new Set<string>();
  for (const nodeId of nodeIds) {
    const node = dataset.studyNodes[nodeId];
    if (!node) continue;
    for (const id of node.allProblemIds) ids.add(id);
  }
  return ids;
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  direction: "asc" | "desc"
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === "asc" ? a - b : b - a;
}

function numericId(id: string): number {
  const parsed = Number.parseInt(id, 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function filterAndSortProblems(
  dataset: NormalizedDataset,
  filters: FilterState,
  statuses: Record<string, ProblemStatus> | null,
  locale: "zh" | "en"
): ProblemRecord[] {
  const allowedIds = selectedProblemIds(
    dataset,
    filters.selectedStudyNodeIds
  );
  const query = filters.search.trim().toLocaleLowerCase();

  const filtered = Object.values(dataset.problems).filter((problem) => {
    if (allowedIds && !allowedIds.has(problem.id)) return false;
    if (!matchesRatingBucket(problem.rating, filters.ratingBucket)) return false;

    if (filters.status !== "all") {
      if (!statuses || statuses[problem.slug] !== filters.status) return false;
    }

    if (query) {
      const title =
        locale === "en" ? problem.titleEn : problem.titleZh || problem.titleEn;
      if (
        !problem.id.toLocaleLowerCase().includes(query) &&
        !title.toLocaleLowerCase().includes(query) &&
        !problem.slug.toLocaleLowerCase().includes(query)
      ) {
        return false;
      }
    }
    return true;
  });

  return filtered.sort((left, right) => {
    let result = 0;
    switch (filters.sortKey) {
      case "rating":
        result = compareNullableNumber(
          left.rating,
          right.rating,
          filters.sortDirection
        );
        break;
      case "arithmeticLevel":
        result = compareNullableNumber(
          left.arithmeticLevel,
          right.arithmeticLevel,
          filters.sortDirection
        );
        break;
      case "id": {
        const difference = numericId(left.id) - numericId(right.id);
        result = filters.sortDirection === "asc" ? difference : -difference;
        break;
      }
      case "title": {
        const leftTitle = locale === "en" ? left.titleEn : left.titleZh;
        const rightTitle = locale === "en" ? right.titleEn : right.titleZh;
        result = leftTitle.localeCompare(rightTitle, locale);
        if (filters.sortDirection === "desc") result *= -1;
        break;
      }
    }
    return result || numericId(left.id) - numericId(right.id);
  });
}
