import type { PlanKey } from "./config";

export type Locale = "zh" | "en";
export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export type ProblemStatus = "TO_DO" | "ATTEMPTED" | "SOLVED";

export interface ProblemRecord {
  id: string;
  slug: string;
  titleZh: string;
  titleEn: string;
  rating: number | null;
  arithmeticLevel: number | null;
  difficulty: Difficulty | null;
  premium: boolean;
  directStudyNodeIds: string[];
}

export interface StudyNode {
  id: string;
  planKey: PlanKey;
  parentId: string | null;
  depth: number;
  titleZh: string;
  titleEn: string | null;
  untranslated: boolean;
  childIds: string[];
  directProblemIds: string[];
  allProblemIds: string[];
}

export interface DatasetTimestamps {
  rating: number;
  level: number;
  studyPlans: number;
}

export interface NormalizedDataset {
  schemaVersion: number;
  problems: Record<string, ProblemRecord>;
  problemIdBySlug: Record<string, string>;
  studyNodes: Record<string, StudyNode>;
  planRootIds: string[];
  timestamps: DatasetTimestamps;
}

export interface RatingSourceRecord {
  ID: string | number;
  Title?: string;
  TitleZH?: string;
  TitleSlug?: string;
  Rating?: string | number;
}

export interface LevelSourceRecord {
  ID: string | number;
  Title?: string;
  TitleCn?: string;
  Url?: string;
  Level?: string | number;
  Difficulty?: string;
  Ispaid?: string | number | boolean;
}

export interface StudyPlanProblem {
  id?: string | number;
  title: string;
  slug: string;
  src?: string;
  score?: number | null;
  difficulty?: number | null;
  isPremium?: boolean;
}

export interface StudyPlanSection {
  title: string;
  summary?: string;
  isLeaf?: boolean;
  children?: StudyPlanSection[];
  problems?: StudyPlanProblem[];
}

export interface StudyPlanRoot {
  title: string;
  src?: string;
  last_update?: string;
  children: StudyPlanSection[];
}

export type RatingBucket =
  | "all"
  | "unrated"
  | "lt1200"
  | "1200-1399"
  | "1400-1599"
  | "1600-1899"
  | "1900-2099"
  | "2100-2399"
  | "gte2400";

export type StatusFilter = "all" | ProblemStatus;
export type SortKey = "rating" | "id" | "arithmeticLevel" | "title";
export type SortDirection = "asc" | "desc";

export interface FilterState {
  ratingBucket: RatingBucket;
  selectedStudyNodeIds: string[];
  status: StatusFilter;
  search: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
}

export interface StatusSyncResult {
  signedIn: boolean;
  username: string | null;
  statuses: Record<string, ProblemStatus>;
  syncedAt: number;
  error?: string;
}

export interface DataRefreshResult {
  datasetAvailable: boolean;
  refreshed: string[];
  warnings: string[];
}

export type BackgroundRequest =
  | { type: "ENSURE_DATA"; force?: boolean }
  | { type: "SYNC_STATUS"; force?: boolean };
