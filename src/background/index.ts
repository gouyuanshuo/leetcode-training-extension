import translationsJson from "../data/studyTranslations.en.json";
import {
  DATA_SCHEMA_VERSION,
  DATA_STORAGE_KEY,
  DAY_MS,
  LEVEL_URL,
  PLAN_KEYS,
  RATING_URL,
  STATUS_SESSION_PREFIX,
  STUDY_PLAN_BASE_URL,
  WEEK_MS,
  type PlanKey
} from "../shared/config";
import {
  applyLevels,
  applyRatings,
  applyStudyPlans,
  createEmptyDataset,
  type StudyTranslationMap
} from "../shared/normalize";
import type {
  BackgroundRequest,
  DataRefreshResult,
  LevelSourceRecord,
  NormalizedDataset,
  RatingSourceRecord,
  StatusSyncResult,
  StudyPlanRoot
} from "../shared/types";
import { getLeetCodeUserInPage, syncStatusInPage } from "./pageStatusSync";

const translations = translationsJson as StudyTranslationMap;
let refreshPromise: Promise<DataRefreshResult> | null = null;

async function readDataset(): Promise<NormalizedDataset> {
  const stored = await chrome.storage.local.get(DATA_STORAGE_KEY);
  const dataset = stored[DATA_STORAGE_KEY] as NormalizedDataset | undefined;
  if (dataset?.schemaVersion === DATA_SCHEMA_VERSION) return dataset;
  return createEmptyDataset();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(`${url}?t=${Date.now()}`, {
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

function due(lastUpdated: number, ttl: number, force: boolean): boolean {
  return force || !lastUpdated || Date.now() - lastUpdated >= ttl;
}

async function performRefresh(force = false): Promise<DataRefreshResult> {
  let dataset = await readDataset();
  const hadCompleteDataset =
    dataset.timestamps.rating > 0 &&
    dataset.timestamps.level > 0 &&
    dataset.timestamps.studyPlans > 0 &&
    Object.keys(dataset.problems).length >= 2000 &&
    dataset.planRootIds.length === PLAN_KEYS.length;
  let changed = false;
  const refreshed: string[] = [];
  const warnings: string[] = [];

  const ratingDue = due(dataset.timestamps.rating, DAY_MS, force);
  const levelDue = due(dataset.timestamps.level, WEEK_MS, force);
  const plansDue = due(dataset.timestamps.studyPlans, WEEK_MS, force);

  const ratingPromise = ratingDue
    ? fetchJson<RatingSourceRecord[]>(RATING_URL)
    : null;
  const levelPromise = levelDue
    ? fetchJson<LevelSourceRecord[]>(LEVEL_URL)
    : null;
  const plansPromise = plansDue
    ? Promise.all(
        PLAN_KEYS.map(async (planKey) => {
          const root = await fetchJson<StudyPlanRoot>(
            `${STUDY_PLAN_BASE_URL}/${planKey}.json`
          );
          return [planKey, root] as const;
        })
      )
    : null;

  if (ratingPromise) {
    try {
      dataset = applyRatings(dataset, await ratingPromise);
      changed = true;
      refreshed.push("rating");
    } catch (error) {
      warnings.push(
        `Rating: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (levelPromise) {
    try {
      dataset = applyLevels(dataset, await levelPromise);
      changed = true;
      refreshed.push("level");
    } catch (error) {
      warnings.push(
        `Arithmetic level: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (plansPromise) {
    try {
      const entries = await plansPromise;
      const plans = Object.fromEntries(entries) as Record<
        PlanKey,
        StudyPlanRoot
      >;
      dataset = applyStudyPlans(dataset, plans, translations);
      changed = true;
      refreshed.push("studyPlans");
    } catch (error) {
      warnings.push(
        `Study plans: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const hasCompleteDataset =
    dataset.timestamps.rating > 0 &&
    dataset.timestamps.level > 0 &&
    dataset.timestamps.studyPlans > 0 &&
    Object.keys(dataset.problems).length >= 2000 &&
    dataset.planRootIds.length === PLAN_KEYS.length;

  // On first install, never commit a partially downloaded dataset. Once a
  // complete cache exists, independently refreshed sources can safely replace
  // their previous normalized slice while failed sources remain untouched.
  if (changed && (hadCompleteDataset || hasCompleteDataset)) {
    await chrome.storage.local.set({ [DATA_STORAGE_KEY]: dataset });
  }

  return {
    datasetAvailable: hadCompleteDataset || hasCompleteDataset,
    refreshed,
    warnings
  };
}

function ensureData(force = false): Promise<DataRefreshResult> {
  if (!refreshPromise || force) {
    refreshPromise = performRefresh(force).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function executeInMainWorld<T>(
  tabId: number,
  func: () => Promise<T>
): Promise<T> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func
  });
  const first = results[0];
  if (!first) throw new Error("LeetCode page did not return a result");
  return first.result as T;
}

async function syncStatus(
  sender: chrome.runtime.MessageSender,
  force = false
): Promise<StatusSyncResult> {
  const tabId = sender.tab?.id;
  const pageUrl = sender.url ?? sender.tab?.url;
  if (tabId == null || !pageUrl) throw new Error("Missing LeetCode tab");
  const host = new URL(pageUrl).host;

  const user = await executeInMainWorld(tabId, getLeetCodeUserInPage);
  if (!user.signedIn || !user.username) {
    return {
      signedIn: false,
      username: null,
      statuses: {},
      syncedAt: Date.now()
    };
  }

  const cacheKey = `${STATUS_SESSION_PREFIX}:${host}:${user.username}`;
  if (!force) {
    const cached = await chrome.storage.session.get(cacheKey);
    if (cached[cacheKey]) return cached[cacheKey] as StatusSyncResult;
  }

  const result = await executeInMainWorld(tabId, syncStatusInPage);
  if (result.signedIn && result.username) {
    await chrome.storage.session.set({ [cacheKey]: result });
  }
  return result;
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureData(false);
});

chrome.runtime.onMessage.addListener(
  (
    request: BackgroundRequest,
    sender,
    sendResponse: (response: unknown) => void
  ) => {
    const operation =
      request.type === "ENSURE_DATA"
        ? ensureData(Boolean(request.force))
        : request.type === "SYNC_STATUS"
          ? syncStatus(sender, Boolean(request.force))
          : Promise.reject(new Error("Unknown request"));

    operation
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          error: error instanceof Error ? error.message : String(error)
        })
      );
    return true;
  }
);
