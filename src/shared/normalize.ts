import {
  DATA_SCHEMA_VERSION,
  PLAN_KEYS,
  PLAN_TITLES,
  type PlanKey
} from "./config";
import type {
  Difficulty,
  LevelSourceRecord,
  NormalizedDataset,
  ProblemRecord,
  RatingSourceRecord,
  StudyNode,
  StudyPlanRoot,
  StudyPlanSection
} from "./types";

export type StudyTranslationMap = Record<string, string>;

export function createEmptyDataset(): NormalizedDataset {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    problems: {},
    problemIdBySlug: {},
    studyNodes: {},
    planRootIds: [],
    timestamps: {
      rating: 0,
      level: 0,
      studyPlans: 0
    }
  };
}

function cloneDataset(dataset: NormalizedDataset): NormalizedDataset {
  return {
    ...dataset,
    problems: Object.fromEntries(
      Object.entries(dataset.problems).map(([id, problem]) => [
        id,
        { ...problem, directStudyNodeIds: [...problem.directStudyNodeIds] }
      ])
    ),
    problemIdBySlug: { ...dataset.problemIdBySlug },
    studyNodes: Object.fromEntries(
      Object.entries(dataset.studyNodes).map(([id, node]) => [
        id,
        {
          ...node,
          childIds: [...node.childIds],
          directProblemIds: [...node.directProblemIds],
          allProblemIds: [...node.allProblemIds]
        }
      ])
    ),
    planRootIds: [...dataset.planRootIds],
    timestamps: { ...dataset.timestamps }
  };
}

export function normalizeSlug(value: string | undefined): string {
  if (!value) return "";
  try {
    if (/^https?:\/\//i.test(value)) {
      return new URL(value).pathname.match(/^\/problems\/([^/]+)/)?.[1] ?? "";
    }
  } catch {
    return "";
  }
  return value.replace(/^\/+|\/+$/g, "").replace(/^problems\//, "");
}

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanStudyTitle(title: string, id: string): string {
  return title
    .replace(new RegExp(`^\\s*${id}\\s*\\.\\s*`), "")
    .trim();
}

function blankProblem(id: string, slug: string): ProblemRecord {
  const fallback = slugToTitle(slug) || `Problem ${id}`;
  return {
    id,
    slug,
    titleZh: fallback,
    titleEn: fallback,
    rating: null,
    arithmeticLevel: null,
    difficulty: null,
    premium: false,
    directStudyNodeIds: []
  };
}

function ensureProblem(
  dataset: NormalizedDataset,
  id: string,
  slug: string
): ProblemRecord {
  const existing = dataset.problems[id];
  if (existing) {
    if (!existing.slug && slug) existing.slug = slug;
    if (slug) dataset.problemIdBySlug[slug] = id;
    return existing;
  }

  const bySlug = slug ? dataset.problemIdBySlug[slug] : undefined;
  if (bySlug && dataset.problems[bySlug]) return dataset.problems[bySlug];

  const problem = blankProblem(id, slug);
  dataset.problems[id] = problem;
  if (slug) dataset.problemIdBySlug[slug] = id;
  return problem;
}

function numericOrNull(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDifficulty(value: unknown): Difficulty | null {
  const difficulty = String(value ?? "").toUpperCase();
  if (
    difficulty === "EASY" ||
    difficulty === "MEDIUM" ||
    difficulty === "HARD"
  ) {
    return difficulty;
  }
  return null;
}

export function applyRatings(
  current: NormalizedDataset,
  records: RatingSourceRecord[],
  timestamp = Date.now()
): NormalizedDataset {
  if (!Array.isArray(records) || records.length < 1000) {
    throw new Error("Rating source returned too few records");
  }

  const next = cloneDataset(current);
  for (const record of records) {
    const id = String(record.ID ?? "").trim();
    const slug = normalizeSlug(record.TitleSlug);
    const rating = numericOrNull(record.Rating);
    if (!id || !slug || rating == null || rating <= 0) continue;
    const problem = ensureProblem(next, id, slug);
    problem.rating = Math.round(rating);
    if (record.TitleZH) problem.titleZh = record.TitleZH;
    if (record.Title) problem.titleEn = record.Title;
  }
  next.timestamps.rating = timestamp;
  return next;
}

export function applyLevels(
  current: NormalizedDataset,
  records: LevelSourceRecord[],
  timestamp = Date.now()
): NormalizedDataset {
  if (!Array.isArray(records) || records.length < 3000) {
    throw new Error("Arithmetic-level source returned too few records");
  }

  const next = cloneDataset(current);
  for (const record of records) {
    const id = String(record.ID ?? "").trim();
    const slug = normalizeSlug(record.Url);
    const level = numericOrNull(record.Level);
    if (!id || !slug || level == null || level <= 0) continue;
    const problem = ensureProblem(next, id, slug);
    problem.arithmeticLevel = Math.round(level);
    problem.difficulty =
      normalizeDifficulty(record.Difficulty) ?? problem.difficulty;
    problem.premium =
      record.Ispaid === true ||
      record.Ispaid === 1 ||
      record.Ispaid === "1" ||
      problem.premium;
    if (record.TitleCn) problem.titleZh = record.TitleCn;
    if (record.Title) problem.titleEn = record.Title;
  }
  next.timestamps.level = timestamp;
  return next;
}

function nodeId(planKey: PlanKey, titlePath: string[]): string {
  return `${planKey}::${titlePath.join(" > ")}`;
}

export function studyTranslationKey(
  planKey: PlanKey,
  titlePath: string[]
): string {
  return nodeId(planKey, titlePath);
}

export function applyStudyPlans(
  current: NormalizedDataset,
  plans: Record<PlanKey, StudyPlanRoot>,
  translations: StudyTranslationMap,
  timestamp = Date.now()
): NormalizedDataset {
  for (const key of PLAN_KEYS) {
    if (!plans[key] || !Array.isArray(plans[key].children)) {
      throw new Error(`Study plan ${key} is missing or invalid`);
    }
  }

  const next = cloneDataset(current);
  next.studyNodes = {};
  next.planRootIds = [];
  for (const problem of Object.values(next.problems)) {
    problem.directStudyNodeIds = [];
  }

  const addSection = (
    planKey: PlanKey,
    section: StudyPlanSection,
    parentId: string,
    titlePath: string[],
    depth: number
  ): string => {
    const path = [...titlePath, section.title.trim()];
    const id = nodeId(planKey, path);
    const translated = translations[id] ?? null;
    const node: StudyNode = {
      id,
      planKey,
      parentId,
      depth,
      titleZh: section.title.trim(),
      titleEn: translated,
      untranslated: translated == null,
      childIds: [],
      directProblemIds: [],
      allProblemIds: []
    };
    next.studyNodes[id] = node;

    for (const item of section.problems ?? []) {
      const slug = normalizeSlug(item.slug || item.src);
      const parsedId =
        String(item.id ?? "").trim() ||
        item.title.match(/^\s*(\d+)\s*\./)?.[1] ||
        next.problemIdBySlug[slug] ||
        "";
      if (!parsedId || !slug) continue;
      const problem = ensureProblem(next, parsedId, slug);
      const titleZh = cleanStudyTitle(item.title, parsedId);
      if (titleZh) problem.titleZh = titleZh;
      if (!problem.titleEn) problem.titleEn = slugToTitle(slug);
      problem.premium = Boolean(item.isPremium) || problem.premium;
      if (!problem.directStudyNodeIds.includes(id)) {
        problem.directStudyNodeIds.push(id);
      }
      if (!node.directProblemIds.includes(parsedId)) {
        node.directProblemIds.push(parsedId);
      }
    }

    for (const child of section.children ?? []) {
      node.childIds.push(addSection(planKey, child, id, path, depth + 1));
    }
    return id;
  };

  for (const planKey of PLAN_KEYS) {
    const rootId = nodeId(planKey, [PLAN_TITLES[planKey].zh]);
    const root: StudyNode = {
      id: rootId,
      planKey,
      parentId: null,
      depth: 0,
      titleZh: PLAN_TITLES[planKey].zh,
      titleEn: PLAN_TITLES[planKey].en,
      untranslated: false,
      childIds: [],
      directProblemIds: [],
      allProblemIds: []
    };
    next.studyNodes[rootId] = root;
    next.planRootIds.push(rootId);
    for (const child of plans[planKey].children) {
      root.childIds.push(
        addSection(planKey, child, rootId, [PLAN_TITLES[planKey].zh], 1)
      );
    }
  }

  const populateAllProblems = (id: string): string[] => {
    const node = next.studyNodes[id];
    const all = new Set(node.directProblemIds);
    for (const childId of node.childIds) {
      for (const problemId of populateAllProblems(childId)) all.add(problemId);
    }
    node.allProblemIds = [...all];
    return node.allProblemIds;
  };
  for (const rootId of next.planRootIds) populateAllProblems(rootId);

  const sectionCount = Object.keys(next.studyNodes).length;
  const referencedProblems = new Set(
    Object.values(next.studyNodes).flatMap((node) => node.directProblemIds)
  ).size;
  if (sectionCount < 300 || referencedProblems < 2000) {
    throw new Error(
      `Study plans look incomplete (${sectionCount} sections, ${referencedProblems} problems)`
    );
  }

  next.timestamps.studyPlans = timestamp;
  return next;
}
