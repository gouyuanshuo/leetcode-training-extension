import { createRoot, type Root } from "react-dom/client";
import styles from "./styles.css?inline";
import { TrainingApp } from "./TrainingApp";
import {
  problemFromHref,
  resolveProblemForElement
} from "./nativeProblemIdentity";
import { DATA_SCHEMA_VERSION, DATA_STORAGE_KEY } from "../shared/config";
import { localeForHost, t } from "../shared/i18n";
import type {
  BackgroundRequest,
  DataRefreshResult,
  NormalizedDataset,
  ProblemRecord,
  StatusSyncResult
} from "../shared/types";

const TRAINING_HOST_ID = "lc-training-extension-root";
const TOGGLE_ID = "lc-training-extension-toggle";
const NATIVE_RATING_ATTRIBUTE = "data-lc-training-native-rating";
const ORIGINAL_TEXT_ATTRIBUTE = "data-lc-training-original-text";

let dataset: NormalizedDataset | null = null;
let dataWarnings: string[] = [];
let trainingRoot: Root | null = null;
let trainingHost: HTMLElement | null = null;
let hiddenNativeList: HTMLElement | null = null;
let hiddenNativeDisplay = "";
let currentUrl = location.href;
let scheduled = false;

function sendMessage<T>(request: BackgroundRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response: T | { error?: string }) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      if (
        response &&
        typeof response === "object" &&
        "error" in response &&
        response.error
      ) {
        reject(new Error(response.error));
        return;
      }
      resolve(response as T);
    });
  });
}

async function readDataset(): Promise<NormalizedDataset | null> {
  const stored = await chrome.storage.local.get(DATA_STORAGE_KEY);
  const loaded = stored[DATA_STORAGE_KEY] as NormalizedDataset | undefined;
  return loaded?.schemaVersion === DATA_SCHEMA_VERSION ? loaded : null;
}

async function ensureDataset(force = false): Promise<{
  dataset: NormalizedDataset;
  result: DataRefreshResult;
}> {
  const result = await sendMessage<DataRefreshResult>({
    type: "ENSURE_DATA",
    force
  });
  const loaded = await readDataset();
  if (!loaded) throw new Error("No normalized dataset is available");
  dataset = loaded;
  dataWarnings = result.warnings;
  return { dataset: loaded, result };
}

function isProblemsetHome(): boolean {
  return /^\/problemset\/?$/.test(location.pathname);
}

function ratingColor(rating: number): string {
  if (rating < 1400) return "#00a86b";
  if (rating < 1900) return "#e5a100";
  if (rating < 2400) return "#f05a47";
  return "#b548d2";
}

function arithmeticText(problem: ProblemRecord): string {
  const locale = localeForHost(location.hostname);
  return locale === "zh"
    ? `算术 ${problem.arithmeticLevel}`
    : `Arithmetic ${problem.arithmeticLevel}`;
}

function decorateNativeRatings(): void {
  if (!dataset) return;
  const candidates = new Set<HTMLElement>(
    document.querySelectorAll<HTMLElement>(
      [
        '[class*="text-sd-easy"]',
        '[class*="text-sd-medium"]',
        '[class*="text-sd-hard"]',
        '[class*="text-lc-green-60"]',
        '[class*="text-lc-yellow-60"]',
        '[class*="text-lc-red-60"]'
      ].join(",")
    )
  );
  for (const element of document.querySelectorAll<HTMLElement>(
    "span, p, div"
  )) {
    if (
      element.childElementCount === 0 &&
      /^(Easy|Med\.?|Medium|Hard|简单|中等|困难)$/i.test(
        element.textContent?.trim() ?? ""
      )
    ) {
      candidates.add(element);
    }
  }
  const difficultyPattern =
    /^(Easy|Med\.?|Medium|Hard|简单|中等|困难)$/i;

  for (const element of candidates) {
    const text = element.textContent?.trim() ?? "";
    const originalText = element.getAttribute(ORIGINAL_TEXT_ATTRIBUTE);
    const difficultyClass =
      element.className.match(
        /text-(?:sd-(easy|medium|hard)|lc-(green|yellow|red)-60)/i
      ) ?? null;
    if (!difficultyClass && !difficultyPattern.test(originalText ?? text)) {
      continue;
    }
    if (
      element.childElementCount > 0 ||
      element.closest(`#${TRAINING_HOST_ID}`)
    ) {
      continue;
    }

    const problem = resolveProblemForElement(dataset, element);
    if (!problem) continue;

    if (!originalText) {
      const kind =
        difficultyClass?.[1]?.toLowerCase() ??
        ({
          green: "easy",
          yellow: "medium",
          red: "hard"
        }[difficultyClass?.[2]?.toLowerCase() ?? ""] as
          | "easy"
          | "medium"
          | "hard"
          | undefined);
      const locale = localeForHost(location.hostname);
      const fallback =
        kind === "easy"
          ? locale === "zh"
            ? "简单"
            : "Easy"
          : kind === "medium"
            ? locale === "zh"
              ? "中等"
              : "Med."
            : kind === "hard"
              ? locale === "zh"
                ? "困难"
                : "Hard"
              : text;
      element.setAttribute(ORIGINAL_TEXT_ATTRIBUTE, fallback);
    }

    if (problem.rating != null && problem.rating > 0) {
      element.setAttribute(NATIVE_RATING_ATTRIBUTE, String(problem.rating));
      const replacement = String(Math.round(problem.rating));
      if (element.textContent !== replacement) element.textContent = replacement;
      element.style.color = ratingColor(problem.rating);
      element.title = `${
        localeForHost(location.hostname) === "zh"
          ? "周赛 Rating"
          : "Contest rating"
      }: ${replacement}`;
    } else if (element.hasAttribute(NATIVE_RATING_ATTRIBUTE)) {
      element.textContent =
        element.getAttribute(ORIGINAL_TEXT_ATTRIBUTE) ?? "";
      element.removeAttribute(NATIVE_RATING_ATTRIBUTE);
      element.style.removeProperty("color");
      element.removeAttribute("title");
    }

    const row = element.parentElement;
    if (row) {
      let badge = row.querySelector<HTMLElement>(
        ":scope > [data-lc-training-level]"
      );
      if (
        problem.arithmeticLevel == null ||
        problem.arithmeticLevel <= 0
      ) {
        badge?.remove();
      } else {
        if (!badge) {
          badge = document.createElement("span");
          badge.dataset.lcTrainingLevel = problem.id;
          Object.assign(badge.style, {
            display: "inline-flex",
            alignItems: "center",
            marginRight: "7px",
            padding: "1px 5px",
            border: "1px solid rgba(139,92,246,.35)",
            borderRadius: "4px",
            fontSize: "11px",
            lineHeight: "18px",
            color: "#a78bfa",
            whiteSpace: "nowrap"
          });
          row.insertBefore(badge, element);
        }
        badge.dataset.lcTrainingLevel = problem.id;
        badge.textContent = arithmeticText(problem);
        badge.title =
          localeForHost(location.hostname) === "zh"
            ? `算术评级：${problem.arithmeticLevel}`
            : `Arithmetic level: ${problem.arithmeticLevel}`;
      }
    }
  }
}

function decorateProblemPage(): void {
  if (!dataset) return;
  const match = location.pathname.match(/^\/problems\/([^/]+)/);
  if (!match) return;
  const id = dataset.problemIdBySlug[decodeURIComponent(match[1])];
  const problem = id ? dataset.problems[id] : null;
  if (!problem || document.querySelector("[data-lc-training-detail-badge]")) {
    return;
  }

  const difficulty = Array.from(
    document.querySelectorAll<HTMLElement>("div, span")
  ).find((element) =>
    /^(Easy|Medium|Hard|简单|中等|困难)$/.test(
      element.textContent?.trim() ?? ""
    )
  );
  if (!difficulty) return;

  const badge = document.createElement("span");
  badge.dataset.lcTrainingDetailBadge = "true";
  const parts: string[] = [];
  if (problem.rating != null && problem.rating > 0) {
    parts.push(`Rating ${Math.round(problem.rating)}`);
  }
  if (problem.arithmeticLevel != null && problem.arithmeticLevel > 0) {
    parts.push(arithmeticText(problem));
  }
  if (!parts.length) return;
  badge.textContent = parts.join(" · ");
  Object.assign(badge.style, {
    display: "inline-flex",
    marginLeft: "10px",
    padding: "2px 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "600",
    color: problem.rating ? ratingColor(problem.rating) : "#8b5cf6",
    background: "rgba(128,128,128,.12)",
    verticalAlign: "middle"
  });
  difficulty.insertAdjacentElement("afterend", badge);
}

function findNativeProblemList(): HTMLElement | null {
  if (!dataset) return null;
  const currentDataset = dataset;
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/problems/"]')
  ).filter((link) => problemFromHref(currentDataset, link.href));
  if (links.length < 2) return null;

  const counts = new Map<HTMLElement, number>();
  for (const link of links.slice(0, 20)) {
    let current = link.parentElement;
    for (let depth = 0; current && depth < 10; depth += 1) {
      counts.set(current, (counts.get(current) ?? 0) + 1);
      current = current.parentElement;
    }
  }

  const candidates = [...counts.entries()]
    .filter(([, count]) => count >= Math.min(5, links.length))
    .map(([element]) => element)
    .filter(
      (element) =>
        !element.matches("body, main") &&
        element.getBoundingClientRect().height >= 160
    )
    .sort(
      (left, right) =>
        left.getBoundingClientRect().height -
        right.getBoundingClientRect().height
    );
  return candidates[0] ?? null;
}

function detectDarkTheme(): boolean {
  const explicit =
    document.documentElement.className + " " + document.body.className;
  if (/dark/i.test(explicit)) return true;
  const color = getComputedStyle(document.body).backgroundColor;
  const numbers = color.match(/\d+/g)?.slice(0, 3).map(Number);
  if (!numbers || numbers.length < 3) return false;
  return numbers[0] * 0.299 + numbers[1] * 0.587 + numbers[2] * 0.114 < 128;
}

function closeTraining(): void {
  trainingRoot?.unmount();
  trainingRoot = null;
  trainingHost?.remove();
  trainingHost = null;
  if (hiddenNativeList) {
    hiddenNativeList.style.display = hiddenNativeDisplay;
  }
  hiddenNativeList = null;
  const toggle = document.getElementById(TOGGLE_ID);
  if (toggle) toggle.textContent = t(localeForHost(location.hostname), "trainingMode");
}

async function openTraining(): Promise<void> {
  if (trainingHost || !isProblemsetHome()) return;
  const toggle = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
  if (toggle) {
    toggle.disabled = true;
    toggle.textContent = t(localeForHost(location.hostname), "loading");
  }
  try {
    const loaded = dataset
      ? {
          dataset,
          result: {
            datasetAvailable: true,
            refreshed: [],
            warnings: dataWarnings
          } satisfies DataRefreshResult
        }
      : await ensureDataset(false);
    const nativeList = findNativeProblemList();
    if (!nativeList) throw new Error("Could not locate the native problem list");

    hiddenNativeList = nativeList;
    hiddenNativeDisplay = nativeList.style.display;
    nativeList.style.display = "none";

    const host = document.createElement("section");
    host.id = TRAINING_HOST_ID;
    host.dataset.theme = detectDarkTheme() ? "dark" : "light";
    nativeList.insertAdjacentElement("beforebegin", host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    const app = document.createElement("div");
    shadow.append(style, app);
    trainingHost = host;
    trainingRoot = createRoot(app);
    trainingRoot.render(
      <TrainingApp
        initialDataset={loaded.dataset}
        initialWarnings={loaded.result.warnings}
        locale={localeForHost(location.hostname)}
        siteOrigin={location.origin}
        onClose={closeTraining}
        onRefresh={() => ensureDataset(true)}
        onSyncStatus={(force) =>
          sendMessage<StatusSyncResult>({ type: "SYNC_STATUS", force })
        }
      />
    );
    if (toggle) toggle.textContent = t(localeForHost(location.hostname), "closeTraining");
  } catch (error) {
    console.warn("[LeetCode Training] Unable to open training mode", error);
    closeTraining();
    if (toggle) toggle.textContent = t(localeForHost(location.hostname), "loadFailed");
  } finally {
    if (toggle) toggle.disabled = false;
  }
}

function ensureToggle(): void {
  const existing = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
  if (!isProblemsetHome()) {
    existing?.remove();
    closeTraining();
    return;
  }
  if (existing) return;

  const locale = localeForHost(location.hostname);
  const button = document.createElement("button");
  button.id = TOGGLE_ID;
  button.type = "button";
  button.textContent = t(locale, "trainingMode");
  Object.assign(button.style, {
    position: "fixed",
    right: "22px",
    bottom: "22px",
    zIndex: "2147483000",
    border: "0",
    borderRadius: "999px",
    padding: "10px 16px",
    color: "#fff",
    background: "#ffa116",
    boxShadow: "0 6px 20px rgba(0,0,0,.24)",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer"
  });
  button.addEventListener("click", () => {
    if (trainingHost) closeTraining();
    else void openTraining();
  });
  document.body.append(button);
}

function processPage(): void {
  ensureToggle();
  decorateNativeRatings();
  decorateProblemPage();
  if (trainingHost) {
    trainingHost.dataset.theme = detectDarkTheme() ? "dark" : "light";
  }
}

function scheduleProcess(): void {
  if (scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    processPage();
  }, 120);
}

const observer = new MutationObserver(scheduleProcess);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.setInterval(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    closeTraining();
    scheduleProcess();
  }
}, 400);

scheduleProcess();
void ensureDataset(false)
  .catch((error) => {
    console.warn("[LeetCode Training] Initial data update failed", error);
  })
  .finally(scheduleProcess);
