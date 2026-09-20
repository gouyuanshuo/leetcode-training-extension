# Training Mode session restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Training Mode open across same-tab problem visits by remounting from `chrome.storage.local` until the user clicks 退出训练, and refresh solve status after leaving a problem page.

**Architecture:** Pure session helpers in `src/shared/trainingSession.ts` own path checks, `{ active, page }` transitions, toggle copy, and status-cache key selection. The content script remounts `TrainingApp` on `/problemset/` when `active` is true (unmount on leave, do not clear the flag). Background handles `INVALIDATE_STATUS` by deleting `lc-training:status:<host>:*` session keys. `TrainingApp` takes `initialPage` and writes `page` back to the session record.

**Tech Stack:** TypeScript, React 19, Chrome MV3 `chrome.storage.local` / `chrome.storage.session`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-training-session-restore-design.md`

## Global Constraints

- Same-tab `<a href>` problem links; no `target="_blank"`, no problem-page trainer bar, no URL query session.
- Sticky until **退出训练**, including browser restart (`chrome.storage.local`).
- Session key `lc-training:session` = `{ active: boolean, page: number }`, separate from `lc-training:filters`.
- One global session (not split by `.cn` / `.com`).
- Auto-sync = drop host status cache when URL leaves `/problems/…`, then existing `syncStatus(false)` on mount. Do not add `force: true` on every restore.
- Restore retries while `active` if native list or dataset is not ready; those failures must not set `active: false`.
- Permissions stay exactly `storage` + `scripting`. No Marionette. No live Firefox profile.
- Vitest only. `npm test` on the touched file, then `npm run verify` before the last commit.
- Do not implement overlay settings, CN data mirrors, 下一题, per-origin session keys, or topic AND.

## File map

| File | Responsibility |
| --- | --- |
| `src/shared/config.ts` | Add `SESSION_STORAGE_KEY` |
| `src/shared/types.ts` | Add `TrainingSession`; extend `BackgroundRequest` |
| `src/shared/trainingSession.ts` | **Create.** Pure helpers used by content + background + tests |
| `tests/trainingSession.test.ts` | **Create.** Locks helpers before any UI wiring |
| `src/background/index.ts` | Handle `INVALIDATE_STATUS` |
| `src/content/TrainingApp.tsx` | `initialPage`; persist page; do not reset page on filter hydrate |
| `src/content/index.tsx` | Restore/unmount/exit; safe `closeTraining`; toggle labels; invalidate on URL change |
| `AGENTS.md` | Replace the “do not drive-by fix the loop” ban with the new session contract |

---

### Task 1: Pure session helpers (RED-GREEN)

**Files:**
- Create: `src/shared/trainingSession.ts`
- Create: `tests/trainingSession.test.ts`
- Modify: `src/shared/config.ts` (add `SESSION_STORAGE_KEY` after `FILTER_STORAGE_KEY`)
- Modify: `src/shared/types.ts` (add `TrainingSession` after `FilterState`; extend `BackgroundRequest`)

**Interfaces:**
- Consumes: `STATUS_SESSION_PREFIX` from `src/shared/config.ts` (existing `"lc-training:status"`)
- Produces:
  - `SESSION_STORAGE_KEY = "lc-training:session"`
  - `interface TrainingSession { active: boolean; page: number }`
  - `BackgroundRequest` union includes `{ type: "INVALIDATE_STATUS" }`
  - `DEFAULT_TRAINING_SESSION: TrainingSession` (`{ active: false, page: 1 }`)
  - `type SessionEvent = { type: "open" } \| { type: "exit" } \| { type: "leave-problemset" } \| { type: "page-change"; page: number }`
  - `normalizeSession(raw: unknown): TrainingSession`
  - `nextSession(state: TrainingSession, event: SessionEvent): TrainingSession`
  - `isProblemsetHome(pathname: string): boolean`
  - `isProblemPage(pathname: string): boolean`
  - `shouldInvalidateStatusCache(prevPathname: string, nextPathname: string): boolean`
  - `statusCacheKeyPrefix(host: string): string`
  - `selectStatusCacheKeys(keys: string[], host: string): string[]`
  - `type ToggleDatasetState = "ready" | "loading" | "failed"`
  - `toggleMessageKey(active: boolean, mounted: boolean, dataset: ToggleDatasetState): "trainingMode" | "closeTraining" | "loading" | "loadFailed"`
  - `toggleClickAction(active: boolean, mounted: boolean): "open" | "exit"`

- [ ] **Step 1: Write the failing test file**

Create `tests/trainingSession.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { STATUS_SESSION_PREFIX } from "../src/shared/config";
import {
  DEFAULT_TRAINING_SESSION,
  isProblemPage,
  isProblemsetHome,
  nextSession,
  normalizeSession,
  selectStatusCacheKeys,
  shouldInvalidateStatusCache,
  statusCacheKeyPrefix,
  toggleClickAction,
  toggleMessageKey
} from "../src/shared/trainingSession";

describe("isProblemsetHome", () => {
  it("accepts the problemset index only", () => {
    expect(isProblemsetHome("/problemset")).toBe(true);
    expect(isProblemsetHome("/problemset/")).toBe(true);
    expect(isProblemsetHome("/problemset/all")).toBe(false);
    expect(isProblemsetHome("/problems/two-sum")).toBe(false);
    expect(isProblemsetHome("/")).toBe(false);
  });
});

describe("isProblemPage", () => {
  it("treats problem subroutes as the same tree", () => {
    expect(isProblemPage("/problems/two-sum")).toBe(true);
    expect(isProblemPage("/problems/two-sum/solutions")).toBe(true);
    expect(isProblemPage("/problemset/")).toBe(false);
    expect(isProblemPage("/problems/")).toBe(false);
  });
});

describe("shouldInvalidateStatusCache", () => {
  it("invalidates only when leaving the problem tree", () => {
    expect(
      shouldInvalidateStatusCache("/problems/two-sum", "/problemset/")
    ).toBe(true);
    expect(
      shouldInvalidateStatusCache(
        "/problems/two-sum/solutions",
        "/problemset/"
      )
    ).toBe(true);
    expect(
      shouldInvalidateStatusCache("/problems/two-sum", "/problems/add-two-numbers")
    ).toBe(false);
    expect(
      shouldInvalidateStatusCache("/problemset/", "/problems/two-sum")
    ).toBe(false);
    expect(shouldInvalidateStatusCache("/problemset/", "/contest/")).toBe(
      false
    );
  });
});

describe("nextSession", () => {
  const onPage2 = { active: true, page: 2 };

  it("open keeps page and sets active", () => {
    expect(nextSession({ active: false, page: 2 }, { type: "open" })).toEqual({
      active: true,
      page: 2
    });
  });

  it("exit clears active and resets page to 1", () => {
    expect(nextSession(onPage2, { type: "exit" })).toEqual({
      active: false,
      page: 1
    });
  });

  it("leave-problemset does not clear active or page", () => {
    expect(nextSession(onPage2, { type: "leave-problemset" })).toEqual(onPage2);
  });

  it("page-change writes page only while active", () => {
    expect(
      nextSession(onPage2, { type: "page-change", page: 3 })
    ).toEqual({ active: true, page: 3 });
    expect(
      nextSession(
        { active: false, page: 1 },
        { type: "page-change", page: 4 }
      )
    ).toEqual({ active: false, page: 1 });
  });
});

describe("normalizeSession", () => {
  it("returns the default for missing or garbage input", () => {
    expect(normalizeSession(undefined)).toEqual(DEFAULT_TRAINING_SESSION);
    expect(normalizeSession(null)).toEqual(DEFAULT_TRAINING_SESSION);
    expect(normalizeSession("nope")).toEqual(DEFAULT_TRAINING_SESSION);
    expect(normalizeSession({ active: true, page: 0 })).toEqual({
      active: true,
      page: 1
    });
    expect(normalizeSession({ active: true, page: Number.NaN })).toEqual({
      active: true,
      page: 1
    });
    expect(normalizeSession({ active: "yes", page: 2 })).toEqual(
      DEFAULT_TRAINING_SESSION
    );
  });
});

describe("status cache keys", () => {
  it("uses the same prefix shape as background syncStatus", () => {
    expect(statusCacheKeyPrefix("leetcode.cn")).toBe(
      `${STATUS_SESSION_PREFIX}:leetcode.cn:`
    );
  });

  it("selects only keys for that host", () => {
    const keys = [
      "lc-training:status:leetcode.cn:alice",
      "lc-training:status:leetcode.com:alice",
      "other"
    ];
    expect(selectStatusCacheKeys(keys, "leetcode.cn")).toEqual([
      "lc-training:status:leetcode.cn:alice"
    ]);
    expect(selectStatusCacheKeys(keys, "leetcode.com")).toEqual([
      "lc-training:status:leetcode.com:alice"
    ]);
  });
});

describe("toggle", () => {
  it("maps copy and click from session + mount + dataset", () => {
    expect(toggleMessageKey(false, false, "ready")).toBe("trainingMode");
    expect(toggleMessageKey(true, true, "ready")).toBe("closeTraining");
    expect(toggleMessageKey(true, false, "loading")).toBe("loading");
    expect(toggleMessageKey(true, false, "ready")).toBe("loading");
    expect(toggleMessageKey(true, false, "failed")).toBe("loadFailed");
    expect(toggleClickAction(false, false)).toBe("open");
    expect(toggleClickAction(true, false)).toBe("exit");
    expect(toggleClickAction(true, true)).toBe("exit");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails because the module is missing**

Run:

```bash
npx vitest run tests/trainingSession.test.ts
```

Expected: FAIL with `Cannot find module '../src/shared/trainingSession'` (or `SESSION_STORAGE_KEY` / exports missing). Do not write production code until you see that failure.

- [ ] **Step 3: Add the storage key and types**

In `src/shared/config.ts`, immediately after `FILTER_STORAGE_KEY`:

```ts
export const SESSION_STORAGE_KEY = "lc-training:session";
```

In `src/shared/types.ts`, after `FilterState`:

```ts
export interface TrainingSession {
  active: boolean;
  page: number;
}
```

Change `BackgroundRequest` to:

```ts
export type BackgroundRequest =
  | { type: "ENSURE_DATA"; force?: boolean }
  | { type: "SYNC_STATUS"; force?: boolean }
  | { type: "INVALIDATE_STATUS" };
```

- [ ] **Step 4: Implement `src/shared/trainingSession.ts`**

```ts
import { STATUS_SESSION_PREFIX } from "./config";
import type { MessageKey } from "./i18n";
import type { TrainingSession } from "./types";

export const DEFAULT_TRAINING_SESSION: TrainingSession = {
  active: false,
  page: 1
};

export type SessionEvent =
  | { type: "open" }
  | { type: "exit" }
  | { type: "leave-problemset" }
  | { type: "page-change"; page: number };

export type ToggleDatasetState = "ready" | "loading" | "failed";

export function isProblemsetHome(pathname: string): boolean {
  return /^\/problemset\/?$/.test(pathname);
}

export function isProblemPage(pathname: string): boolean {
  return /^\/problems\/[^/]+/.test(pathname);
}

export function shouldInvalidateStatusCache(
  prevPathname: string,
  nextPathname: string
): boolean {
  return isProblemPage(prevPathname) && !isProblemPage(nextPathname);
}

export function normalizeSession(raw: unknown): TrainingSession {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TRAINING_SESSION };
  const candidate = raw as { active?: unknown; page?: unknown };
  if (typeof candidate.active !== "boolean") {
    return { ...DEFAULT_TRAINING_SESSION };
  }
  const page = Number(candidate.page);
  return {
    active: candidate.active,
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
  };
}

export function nextSession(
  state: TrainingSession,
  event: SessionEvent
): TrainingSession {
  switch (event.type) {
    case "open":
      return { active: true, page: state.page };
    case "exit":
      return { active: false, page: 1 };
    case "leave-problemset":
      return { ...state };
    case "page-change":
      if (!state.active) return state;
      return { active: true, page: event.page };
  }
}

export function statusCacheKeyPrefix(host: string): string {
  return `${STATUS_SESSION_PREFIX}:${host}:`;
}

export function selectStatusCacheKeys(keys: string[], host: string): string[] {
  const prefix = statusCacheKeyPrefix(host);
  return keys.filter((key) => key.startsWith(prefix));
}

export function toggleMessageKey(
  active: boolean,
  mounted: boolean,
  dataset: ToggleDatasetState
): Extract<
  MessageKey,
  "trainingMode" | "closeTraining" | "loading" | "loadFailed"
> {
  if (!active) return "trainingMode";
  if (mounted) return "closeTraining";
  if (dataset === "failed") return "loadFailed";
  return "loading";
}

export function toggleClickAction(
  active: boolean,
  mounted: boolean
): "open" | "exit" {
  return active || mounted ? "exit" : "open";
}
```

- [ ] **Step 5: Re-run tests and confirm they pass**

Run:

```bash
npx vitest run tests/trainingSession.test.ts
```

Expected: PASS, all describes green.

- [ ] **Step 6: Commit only these files**

```bash
git add src/shared/config.ts src/shared/types.ts src/shared/trainingSession.ts tests/trainingSession.test.ts
git commit -m "$(cat <<'EOF'
feat: add Training Mode session helpers

Pure path, session, toggle, and status-cache key helpers with Vitest coverage for sticky restore.
EOF
)"
```

Do not stage Firefox patch files, `AGENTS.md`, or `dist/`.

---

### Task 2: Background `INVALIDATE_STATUS`

**Files:**
- Modify: `src/background/index.ts`

**Interfaces:**
- Consumes: `BackgroundRequest` with `{ type: "INVALIDATE_STATUS" }`; `selectStatusCacheKeys(keys: string[], host: string): string[]`
- Produces: `invalidateStatus(sender: chrome.runtime.MessageSender): Promise<{ cleared: number }>` wired in `onMessage`. Idempotent. No GraphQL.

There is no Chrome session-storage mock in this repo. Do **not** invent a fake browser. This task’s test is Task 1’s `selectStatusCacheKeys` plus typecheck.

- [ ] **Step 1: Run helpers to confirm Task 1 is green before wiring**

Run:

```bash
npx vitest run tests/trainingSession.test.ts
```

Expected: PASS.

- [ ] **Step 2: Add invalidate handler and route it**

At the top of `src/background/index.ts`, add `selectStatusCacheKeys` to the `../shared/trainingSession` import (new import line):

```ts
import { selectStatusCacheKeys } from "../shared/trainingSession";
```

After `syncStatus`, add:

```ts
async function invalidateStatus(
  sender: chrome.runtime.MessageSender
): Promise<{ cleared: number }> {
  const pageUrl = sender.url ?? sender.tab?.url;
  if (!pageUrl) return { cleared: 0 };
  const host = new URL(pageUrl).host;
  const all = await chrome.storage.session.get(null);
  const keys = selectStatusCacheKeys(Object.keys(all), host);
  if (keys.length > 0) await chrome.storage.session.remove(keys);
  return { cleared: keys.length };
}
```

Replace the `operation` ternary in `onMessage` with:

```ts
    const operation =
      request.type === "ENSURE_DATA"
        ? ensureData(Boolean(request.force))
        : request.type === "SYNC_STATUS"
          ? syncStatus(sender, Boolean(request.force))
          : request.type === "INVALIDATE_STATUS"
            ? invalidateStatus(sender)
            : Promise.reject(new Error("Unknown request"));
```

Do not change `syncStatus` itself.

- [ ] **Step 3: Typecheck and unit tests**

Run:

```bash
npx tsc --noEmit
npx vitest run
```

Expected: `tsc` exit 0; existing tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add src/background/index.ts
git commit -m "$(cat <<'EOF'
feat: drop host status cache on INVALIDATE_STATUS

Lets Training Mode remount refetch solve status after leaving a problem page.
EOF
)"
```

---

### Task 3: `TrainingApp` restores and persists table page

**Files:**
- Modify: `src/content/TrainingApp.tsx`

**Interfaces:**
- Consumes: `TrainingSession`, `SESSION_STORAGE_KEY`, `normalizeSession(raw: unknown): TrainingSession`, `nextSession(state, event)`
- Produces: `TrainingAppProps.initialPage: number`; header `onClose` unchanged (parent owns exit); page writes `{ type: "page-change", page }` only through `nextSession`

Critical existing bug to fix: the filters `useEffect` currently always `setPage(1)` when `filters`/`filtersLoaded` change, including the first hydrate. That would wipe a restored page 2. Skip the reset on the first hydrate only.

- [ ] **Step 1: Write a failing helper test for hydrate vs later filter changes**

Append to `tests/trainingSession.test.ts`:

```ts
import { pageAfterFilterUpdate } from "../src/shared/trainingSession";

describe("pageAfterFilterUpdate", () => {
  it("keeps the restored page on the first hydrate, then resets to 1", () => {
    expect(pageAfterFilterUpdate(true, 2)).toBe(2);
    expect(pageAfterFilterUpdate(false, 2)).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run:

```bash
npx vitest run tests/trainingSession.test.ts
```

Expected: FAIL — `pageAfterFilterUpdate` is not exported.

- [ ] **Step 3: Add the helper**

In `src/shared/trainingSession.ts`:

```ts
export function pageAfterFilterUpdate(
  isHydration: boolean,
  restoredPage: number
): number {
  return isHydration ? restoredPage : 1;
}
```

- [ ] **Step 4: Confirm the new test passes**

Run:

```bash
npx vitest run tests/trainingSession.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire `TrainingApp`**

Add imports:

```ts
import { FILTER_STORAGE_KEY, SESSION_STORAGE_KEY } from "../shared/config";
import {
  nextSession,
  normalizeSession,
  pageAfterFilterUpdate
} from "../shared/trainingSession";
```

(`FILTER_STORAGE_KEY` is already imported from config — extend that import rather than duplicating.)

Add to `TrainingAppProps`:

```ts
  initialPage: number;
```

Change the function signature to take `initialPage` and replace page state:

```ts
export function TrainingApp({
  initialDataset,
  initialPage,
  locale,
  siteOrigin,
  initialWarnings,
  onClose,
  onRefresh,
  onSyncStatus
}: TrainingAppProps) {
```

Replace `const [page, setPage] = useState(1);` with:

```ts
  const [page, setPage] = useState(() =>
    pageAfterFilterUpdate(true, initialPage)
  );
  const filtersHydrated = useRef(false);
```

Add `useRef` to the react import list.

Replace the filters persist effect (the one that currently `setPage(1)` unconditionally) with:

```ts
  useEffect(() => {
    if (filtersLoaded) {
      void chrome.storage.local.set({ [FILTER_STORAGE_KEY]: filters });
    }
    if (!filtersLoaded) return;
    if (!filtersHydrated.current) {
      filtersHydrated.current = true;
      return;
    }
    setPage(pageAfterFilterUpdate(false, page));
  }, [filters, filtersLoaded]);
```

Do **not** put `page` in that effect’s dependency list (it would loop). The `page` argument to `pageAfterFilterUpdate(false, page)` is unused when `isHydration` is false (returns `1`); passing `page` is fine.

Add persist-page effect **after** the clamp effect:

```ts
  useEffect(() => {
    if (!filtersLoaded) return;
    void chrome.storage.local.get(SESSION_STORAGE_KEY).then((stored) => {
      const session = normalizeSession(stored[SESSION_STORAGE_KEY]);
      const next = nextSession(session, { type: "page-change", page });
      if (next.page === session.page && next.active === session.active) return;
      void chrome.storage.local.set({ [SESSION_STORAGE_KEY]: next });
    });
  }, [page, filtersLoaded]);
```

Leave `onClose` as a plain callback — the content script will persist exit. Do not write `active: false` inside `TrainingApp`.

- [ ] **Step 6: Typecheck (new required prop)**

Run:

```bash
npx tsc --noEmit
```

Expected: FAIL on `src/content/index.tsx` — `initialPage` is missing from `<TrainingApp />`. That failure is the cue for Task 4. If you are executing tasks strictly one at a time, add a temporary `initialPage={1}` in `index.tsx` **only if** you must commit this task green alone:

```tsx
        initialPage={1}
```

and let Task 4 replace it with the session page. Prefer completing Task 4 in the same working tree without that temporary if the executor runs tasks sequentially in one branch.

- [ ] **Step 7: Tests**

Run:

```bash
npx vitest run tests/trainingSession.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/shared/trainingSession.ts tests/trainingSession.test.ts src/content/TrainingApp.tsx
git commit -m "$(cat <<'EOF'
feat: restore and persist Training Mode table page

Skip the first filter-hydrate page reset so a sticky session can remount on page 2.
EOF
)"
```

If `index.tsx` still has a temporary `initialPage={1}`, include it in this commit only if `tsc` required it; Task 4 will replace it.

---

### Task 4: Content script remount, safe unmount, toggle, invalidate

**Files:**
- Modify: `src/content/index.tsx`

**Interfaces:**
- Consumes: `SESSION_STORAGE_KEY`, `normalizeSession`, `nextSession`, `isProblemsetHome(pathname)`, `isProblemPage` (via `shouldInvalidateStatusCache`), `shouldInvalidateStatusCache`, `toggleMessageKey`, `toggleClickAction`, `TrainingApp` `initialPage`
- Produces: content-script behavior in the spec’s “Runtime flow”. No new exports required.

Replace the local `isProblemsetHome()` (pathname on `location`) with the shared helper: `isProblemsetHome(location.pathname)`.

- [ ] **Step 1: Re-run helper tests (contract this file must honor)**

Run:

```bash
npx vitest run tests/trainingSession.test.ts
```

Expected: PASS. If not, stop; do not edit `index.tsx`.

- [ ] **Step 2: Add session I/O and rewrite close/open/toggle/poll**

Imports to add/extend:

```ts
import { DATA_STORAGE_KEY, SESSION_STORAGE_KEY } from "../shared/config";
import {
  isProblemsetHome,
  nextSession,
  normalizeSession,
  shouldInvalidateStatusCache,
  toggleClickAction,
  toggleMessageKey,
  type ToggleDatasetState
} from "../shared/trainingSession";
```

Delete the local function:

```ts
function isProblemsetHome(): boolean {
  return /^\/problemset\/?$/.test(location.pathname);
}
```

Every call site uses `isProblemsetHome(location.pathname)`.

Add module-level:

```ts
let session = normalizeSession(undefined);
let datasetState: ToggleDatasetState = "loading";
let restoreAttempt: Promise<void> | null = null;
```

Add:

```ts
async function readSession() {
  const stored = await chrome.storage.local.get(SESSION_STORAGE_KEY);
  session = normalizeSession(stored[SESSION_STORAGE_KEY]);
  return session;
}

async function writeSession(event: Parameters<typeof nextSession>[1]) {
  session = nextSession(session, event);
  await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: session });
}

function pathnameOf(href: string): string {
  try {
    return new URL(href, location.origin).pathname;
  } catch {
    return "";
  }
}

function refreshToggle(): void {
  const toggle = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
  if (!toggle) return;
  const locale = localeForHost(location.hostname);
  toggle.textContent = t(
    locale,
    toggleMessageKey(session.active, Boolean(trainingHost), datasetState)
  );
}
```

Replace `closeTraining` with a safe unmount that does **not** write `active: false` and does **not** assume the native list is still attached:

```ts
function closeTraining(): void {
  trainingRoot?.unmount();
  trainingRoot = null;
  trainingHost?.remove();
  trainingHost = null;
  if (hiddenNativeList?.isConnected) {
    hiddenNativeList.style.display = hiddenNativeDisplay;
  }
  hiddenNativeList = null;
  refreshToggle();
}

async function exitTraining(): Promise<void> {
  closeTraining();
  await writeSession({ type: "exit" });
  refreshToggle();
}
```

In `openTraining`:

- Guard: `if (trainingHost || !isProblemsetHome(location.pathname)) return;`
- After a user click path, the caller will have set `active` true already. Restore path also has `active` true. `openTraining` itself should `await writeSession({ type: "open" })` so a first click persists (keeps page).
- Pass `initialPage={session.page}` into `<TrainingApp />`.
- `onClose={() => { void exitTraining(); }}` — **not** `closeTraining`.
- On success set `datasetState = "ready"` and `refreshToggle()`.
- On failure: **do not** call `exitTraining`. Call `closeTraining()` only to clear a half-mounted host. If the error is `"Could not locate the native problem list"`, set `datasetState = "loading"` (retry). If `ensureDataset` threw, set `datasetState = "failed"`. Keep `session.active` as-is. `refreshToggle()`.

`openTraining` catch block (replace the current `closeTraining()` + loadFailed always):

```ts
  } catch (error) {
    console.warn("[LeetCode Training] Unable to open training mode", error);
    closeTraining();
    const message = error instanceof Error ? error.message : String(error);
    datasetState =
      message === "Could not locate the native problem list"
        ? "loading"
        : "failed";
    refreshToggle();
  } finally {
    if (toggle) toggle.disabled = false;
  }
```

Before `ensureDataset` in `openTraining`, if `dataset` is already loaded set `datasetState = "ready"`. If calling `ensureDataset`, set `datasetState = "loading"` and `refreshToggle()` first.

Rewrite `ensureToggle`:

```ts
function ensureToggle(): void {
  const locale = localeForHost(location.hostname);
  if (!isProblemsetHome(location.pathname)) {
    document.getElementById(TOGGLE_ID)?.remove();
    closeTraining();
    return;
  }

  let button = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
  if (!button) {
    button = document.createElement("button");
    button.id = TOGGLE_ID;
    button.type = "button";
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
      const action = toggleClickAction(session.active, Boolean(trainingHost));
      if (action === "exit") void exitTraining();
      else void openTraining();
    });
    document.body.append(button);
  }
  refreshToggle();
}
```

Rewrite `processPage` to kick restore:

```ts
function processPage(): void {
  ensureToggle();
  decorateNativeRatings();
  decorateProblemPage();
  if (trainingHost) {
    trainingHost.dataset.theme = detectDarkTheme() ? "dark" : "light";
  }
  if (
    isProblemsetHome(location.pathname) &&
    session.active &&
    !trainingHost &&
    !restoreAttempt
  ) {
    restoreAttempt = openTraining().finally(() => {
      restoreAttempt = null;
    });
  }
}
```

Replace the 400ms poll:

```ts
window.setInterval(() => {
  if (location.href === currentUrl) return;
  const previous = currentUrl;
  currentUrl = location.href;
  const prevPath = pathnameOf(previous);
  const nextPath = pathnameOf(currentUrl);
  if (shouldInvalidateStatusCache(prevPath, nextPath)) {
    void sendMessage({ type: "INVALIDATE_STATUS" });
  }
  if (!isProblemsetHome(nextPath)) {
    closeTraining();
  }
  scheduleProcess();
}, 400);
```

On boot, before `scheduleProcess()`, read session:

```ts
void readSession().then(() => {
  scheduleProcess();
});
```

Keep the existing `ensureDataset(false)` boot fetch; on success set `datasetState = "ready"`, on failure if `dataset` is still null set `datasetState = "failed"`, then `scheduleProcess()`.

- [ ] **Step 3: Typecheck and tests**

Run:

```bash
npx tsc --noEmit
npx vitest run
```

Expected: both green. `TrainingApp` receives `initialPage`.

- [ ] **Step 4: Commit**

```bash
git add src/content/index.tsx src/content/TrainingApp.tsx
git commit -m "$(cat <<'EOF'
feat: remount Training Mode from local session storage

Unmount on SPA leave without clearing active; restore on /problemset/; invalidate status cache after a problem page.
EOF
)"
```

---

### Task 5: Docs gate and verify

**Files:**
- Modify: `AGENTS.md` (hard-ban paragraph about the training loop)
- Modify: `docs/superpowers/specs/2026-09-19-training-session-restore-design.md` (status line)

**Interfaces:** none.

- [ ] **Step 1: Update `AGENTS.md`**

Replace this bullet:

```
- Training Mode mounts only on pathname `/problemset/`. Clicking a problem
  currently **closes** the mode (SPA). Do not “fix” that as a drive-by; it is
  a product loop change — brainstorm first.
```

with:

```
- Training Mode mounts only on pathname `/problemset/`. Session is
  `lc-training:session` `{ active, page }` in `chrome.storage.local`. Leave
  `/problemset/` unmounts the panel but does not clear `active`. **退出训练**
  is the only off switch. Status cache is dropped when leaving `/problems/…`
  (`INVALIDATE_STATUS`). Spec:
  `docs/superpowers/specs/2026-09-19-training-session-restore-design.md`.
```

- [ ] **Step 2: Mark the spec approved**

Change the spec header status line from:

```
**Status:** Draft for human review (brainstormed 2026-09-19). No implementation
until this file is approved.
```

to:

```
**Status:** Approved 2026-09-19. Implemented via
`docs/superpowers/plans/2026-09-19-training-session-restore.md`.
```

- [ ] **Step 3: Full verify**

Run:

```bash
npm run verify
```

Expected: lint, vitest, build, and `validate-manifest` all pass. Manifest permissions remain exactly `storage` and `scripting`. `dist/manifest.json` still has no extra hosts.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/superpowers/specs/2026-09-19-training-session-restore-design.md
git commit -m "$(cat <<'EOF'
docs: record Training Mode sticky session contract

Point AGENTS.md at the restore spec after verify passed.
EOF
)"
```

Do not `git push` unless the human partner asks.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| `TrainingSession` + `lc-training:session` | 1 |
| `isProblemsetHome` / `isProblemPage` / invalidate predicate | 1 |
| `nextSession` open / exit / leave / page-change | 1 |
| `normalizeSession` garbage / page `< 1` | 1 |
| Toggle copy + click while loading / failed / mounted | 1, 4 |
| `INVALIDATE_STATUS` deletes `lc-training:status:<host>:` | 1 keys + 2 handler |
| Remount on `/problemset/` when `active` | 4 |
| Unmount on leave without clearing `active` | 4 |
| Safe detached native list | 4 (`isConnected`) |
| `initialPage` + persist page + no hydrate reset | 3 |
| `syncStatus(false)` after cache drop (no always-force) | 2 + 4 (existing mount sync) |
| Exit via toggle or header | 4 `exitTraining` |
| Retry list missing; keep `active` on dataset fail | 4 catch |
| Two tabs share one flag | storage.local (no extra code) |
| No problem-page UI / no `target="_blank"` / no query | 4 (do not add) |
| Manifest unchanged | 5 verify |
| `AGENTS.md` contract | 5 |

No TBD, no “add validation later”, no “similar to Task N” implementation steps.
