# Training Mode session restore — Design Spec

**Status:** Approved 2026-09-19. Implemented via
`docs/superpowers/plans/2026-09-19-training-session-restore.md`.
**Objective:** Keep Training Mode as a sticky session: same-tab problem pages
unmount the panel, and returning to `/problemset/` remounts it with the same
filters, table page, and fresh solve status, until the user clicks 退出训练.
**Non-goals:** Overlay on/off settings, CN first-run data mirrors, a trainer
bar / 下一题 on the problem page, new-tab problem links, URL query state.

## Problem

Training Mode is a filterable queue, but the practice loop is one click long.

On `/problemset/`, `src/content/index.tsx` mounts `TrainingApp` into a Shadow
root next to LeetCode’s native list. Problem titles are ordinary same-tab
`<a href="/problems/…">`. A 400ms poll sees the SPA URL change and calls
`closeTraining()`. `ensureToggle()` also calls `closeTraining()` off
`/problemset/`. Browser Back remounts the native list; the user must click
**训练模式** again. Table `page` is React state only (filters persist;
page does not). Status lives in `chrome.storage.session` and is reused on
`syncStatus(false)`, so a just-accepted problem still looks unsolved until
**同步状态**.

Filters already persist in `lc-training:filters`. The missing piece is
**session** (open + page) plus **status cache invalidation** when leaving a
problem.

## Decisions

| # | Decision | Why |
|---|----------|-----|
| 1 | Same-tab navigation, no `target="_blank"`, no problem-page chrome | Matches LeetCode habit; Back is the return path |
| 2 | Sticky until **退出训练**, including browser restart | A practice session, not a one-shot overlay. Same lifetime idea as filters |
| 3 | Remount from `chrome.storage.local`, do not keep a hidden React tree | Leaving `/problemset/` destroys the list node; a body portal would leak onto every LeetCode view |
| 4 | New key `lc-training:session` = `{ active, page }`, not mixed into filters | Exit must not wipe search / 题单 / rating |
| 5 | One global session key (not split by `.cn` / `.com`) | Matches today’s global filters. Two 题库 tabs share one flag |
| 6 | Auto-sync by **dropping** the host’s session status cache when the URL leaves `/problems/…`, then existing `syncStatus(false)` on mount | Shows the new AC without a full GraphQL refetch on every 题库 visit that did not come from a problem |
| 7 | Restore retries while `active` if the native list or dataset is not ready; do not clear `active` on those failures | First paint of `/problemset/` often has no list yet |

## Session record

```ts
// chrome.storage.local key: lc-training:session
interface TrainingSession {
  active: boolean;
  page: number; // 1-based table page, default 1
}
```

Default when missing: `{ active: false, page: 1 }`. Invalid `page` (non-finite,
`< 1`) is treated as `1`.

| Event | UI | `active` | `page` |
| --- | --- | --- | --- |
| Click **训练模式** | `openTraining()` | `true` | keep (or `1` if none) |
| Click **退出训练** (floating toggle or header close) | `closeTraining()` | `false` | `1` |
| Leave `/problemset/` | unmount only | unchanged | unchanged |
| Land on `/problemset/` and `active === true` | remount when native list exists | unchanged | restore into `TrainingApp` |
| Table page change while mounted | — | unchanged | write new page |
| `openTraining()` fails (no list / dataset still loading) | stay unmounted, retry | `true` | unchanged |

`lc-training:filters` is unchanged.

## Runtime flow

Content script keeps the 400ms href poll, MutationObserver, and `scheduleProcess`.
Semantics change as follows.

### Path helpers (pure, unit-tested)

- `isProblemsetHome(pathname)` — true iff `^/problemset/?$` (today’s rule).
  Query string is ignored (uses pathname only). `/problemset/all` is false.
- `isProblemPage(pathname)` — true iff `^/problems/[^/]+`. Subroutes
  (`/solutions`, `/editorial`, …) count as problem pages so 题解 → Back still
  invalidates cache once when leaving the problem tree.

### URL change

Previous and next href are parsed. Then:

1. If **previous** is a problem page and **next** is not, send
   `{ type: "INVALIDATE_STATUS" }` to the background. Background deletes every
   `chrome.storage.session` key that starts with
   `lc-training:status:<host>:` for the sender tab’s host. No GraphQL here.
2. If **next** is not problemset home: `closeTraining()` (unmount). Do **not**
   write `active: false`. Remove the floating toggle (today’s `ensureToggle`
   off-home behavior).
3. If **next** is problemset home: `scheduleProcess()` as now.

### `processPage` / restore

On problemset home:

1. Ensure the floating toggle exists. **Do not** `return` early without
   refreshing its label (today’s `if (existing) return` is wrong once we have
   session state).
2. If `session.active && !trainingHost`, attempt `openTraining()`:
   - Native list missing → skip this tick; toggle copy = **正在加载训练数据…**
     (or EN equivalent). Clicking the toggle in this state is **exit**
     (`active: false`), not a second open.
   - Dataset missing but fetch in flight → same loading copy; retry later.
   - Dataset hard-fail (no cache) → toggle **训练数据暂时不可用**; keep
     `active: true` so a later successful `ensureDataset` can remount.
3. If `trainingHost` is mounted, toggle copy = **退出训练**; click exits.
4. If `!session.active`, toggle copy = **训练模式**; click opens and sets
   `active: true`.

`openTraining()` hides the native list and mounts `TrainingApp` as today, plus:

- Read `session.page` and pass `initialPage` into `TrainingApp`.
- Set `active: true` if this open came from the user click (restore already
  has `true`).

`closeTraining()`:

- Unmount React, remove host, restore native list `display` **only if**
  `hiddenNativeList` is still in `document`.
- Must be safe on a detached node (SPA already tore the list down).

### `TrainingApp`

- `useState(initialPage)` for page, clamped with existing `pageCount` effect.
- Persist `session.page` whenever `page` changes and session is active
  (same pattern as filter writes after `filtersLoaded`).
- Existing mount `syncStatus(false)` stays. After invalidation, cache miss
  refetches. After a 题库 visit that did not leave a problem, cache hit.
- Status sync failure: keep the table, show existing **状态同步失败…**
  notice; do not set `active: false`.
- Header **退出训练** / `onClose` is the same exit path as the floating
  toggle: unmount + `active: false` + `page: 1`.

### Background

New message `{ type: "INVALIDATE_STATUS" }` beside `ENSURE_DATA` /
`SYNC_STATUS`. Uses `sender.tab.url` / `sender.url` host. Idempotent if no
keys exist. Does not change `syncStatus` itself.

## Error and edge cases

| Case | Behavior |
| --- | --- |
| Native list not in DOM yet | Retry on process loop; loading toggle; `active` stays true |
| First-run dataset not cached | Loading, then load-failed copy if no cache; `active` stays true |
| Status sync fails | Table opens; notice; no exit |
| Page > `pageCount` after filter/status change | Existing clamp |
| Two `/problemset/` tabs | One `active`. Exit in either tab closes the session for both |
| Browser restart | `active` and `page` survive (`local`). Status cache does not (`session`); mount sync does a full fetch |
| Problem page with sticky session | No extra UI. User uses Back or the site chrome |
| `hiddenNativeList` detached | `closeTraining()` no-ops style restore |

## Files

| File | Role |
| --- | --- |
| `src/shared/config.ts` | `SESSION_STORAGE_KEY = "lc-training:session"` |
| `src/shared/types.ts` | `TrainingSession`; extend `BackgroundRequest` with `INVALIDATE_STATUS` |
| `src/shared/trainingSession.ts` | **New.** Pure helpers: `isProblemsetHome`, `isProblemPage`, `shouldInvalidateStatusCache`, `nextSession`, `defaultSession`, `normalizeSession` |
| `src/background/index.ts` | Handle `INVALIDATE_STATUS`; delete matching session keys |
| `src/content/index.tsx` | Poll/restore/exit; safe unmount; toggle labels; send invalidate |
| `src/content/TrainingApp.tsx` | `initialPage`; persist page; exit writes session |
| `tests/trainingSession.test.ts` | **New.** Table in §Testing |

No manifest / permission changes. No Firefox-only patch beyond existing
`build:firefox`.

## Testing

Vitest, no live browser, no Marionette.

`tests/trainingSession.test.ts` (RED before production code):

| Helper | Cases |
| --- | --- |
| `isProblemsetHome` | `/problemset`, `/problemset/` true; `/problemset/all`, `/problems/two-sum`, `/` false |
| `isProblemPage` | `/problems/two-sum`, `/problems/two-sum/solutions` true; `/problemset/` false |
| `shouldInvalidateStatusCache(prevPath, nextPath)` | problem → problemset true; problem → another problem false; problemset → problem false; problemset → `/contest/` false; problem `/solutions` → problemset true |
| `nextSession(state, event)` | `open` → `{active:true, page}` (keep page); `exit` → `{active:false, page:1}`; `leave-problemset` leaves `active` true; `page-change` updates page only when active; `page-change` while inactive is a no-op |
| `normalizeSession` | missing/garbage → default; `page: 0` or `NaN` → `1` |

`TrainingApp` page: keep using the storage-shaped session object as input
(`initialPage`); no JSDOM requirement for this spec if the helper tests
cover `nextSession('page-change')`. If a component test is added later, it
must still be Vitest and must not launch Firefox.

Gate: `npm test` on the new file, then `npm run verify`.

## Success criteria

1. Open Training Mode, set filters, go to table page 2, click a problem
   (same tab), submit or not, Back to `/problemset/` → panel is open, same
   filters, page 2 (or clamped), without clicking **训练模式**.
2. That problem shows 已解决 / SOLVED after an AC without clicking
   **同步状态** (logged-in).
3. **退出训练** then reload `/problemset/` → native list, no auto remount.
4. Restart the browser with `active: true` → `/problemset/` remounts
   training (status may take one sync).
5. `npm run verify` green. Manifest still `storage` + `scripting` only.

## Out of scope (do not sneak in)

- Overlay Easy/Medium/Hard vs rating
- CN-reachable data mirrors / weakening first-install all-or-nothing
- 下一题 / remaining count on the problem page
- Per-origin session keys
- Persisting solve status in `chrome.storage.local`
- Changing topic union to intersection
