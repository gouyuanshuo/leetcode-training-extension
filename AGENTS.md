# AGENTS.md — LeetCode Training Mode

Router for coding agents. Do **not** dump the whole repo at session start.
Read this file, open the **one** area the task belongs to, then work.

This is a Chrome MV3 / Firefox MV3 content+background extension. It is **not**
LeetCode official. It overlays contest rating + arithmetic level, and a
filterable “Training Mode” on `leetcode.com` / `leetcode.cn`.

## Superpowers (do this before code)

Installed plugin: `superpowers`. User instructions in this file win over
skills; skills win over default agent behavior.

| Kind of work | Skill order |
| --- | --- |
| New feature, UX change, new subsystem | `brainstorming` → (architectural: spec in `docs/superpowers/specs/`) → `writing-plans` → `test-driven-development` |
| Bug / “something is wrong” | `systematic-debugging` → failing test → fix |
| Implementing an already-written plan | `subagent-driven-development` or `executing-plans` |
| Isolated git work | `using-git-worktrees` |
| Before claiming done | `verification-before-completion` |

**Hard gates:** no production code without a failing test first. No
implementation until the human partner approved the design (chat is enough
for bounded work; architectural work needs a spec file). Do not skip
brainstorming because the change “looks small.”

## Startup

1. Read this file.
2. Open only the files in the map row for the task.
3. Run `npm test` (or the named test file) before editing if behavior exists.
4. After a behavior change: `npm run verify`. Firefox packaging:
   `npm run build:firefox`.

## Map

| If the task is about… | Read |
| --- | --- |
| URLs, TTLs, storage keys, 12 灵茶 plan keys | `src/shared/config.ts` |
| Dataset / filter / message types | `src/shared/types.ts` |
| Rating buckets, topic union, search, sort | `src/shared/filters.ts` |
| Merge rating JSON + stormlevel + study plans | `src/shared/normalize.ts` |
| zh/en copy, host → locale | `src/shared/i18n.ts` |
| Data refresh, `scripting.executeScript`, session status cache | `src/background/index.ts` |
| In-page GraphQL user + problemset status | `src/background/pageStatusSync.ts` |
| Toggle, native-list decoration, SPA close | `src/content/index.tsx` |
| Training UI (filters, table, topic tree) | `src/content/TrainingApp.tsx` |
| Match difficulty cells to problems | `src/content/problemMatcher.ts` |
| Bundled 灵茶 English headings | `src/data/studyTranslations.en.json` |
| MV3 permissions / hosts / gecko id | `manifest.config.ts` |
| Firefox dist patch (scripts background, drop `use_dynamic_url`) | `scripts/patch-firefox-manifest.mjs` |
| Permission + host lock | `scripts/validate-manifest.mjs` |

```text
content (UI, DOM)  →  shared, chrome.runtime messages
background         →  shared, fetch JSON, chrome.scripting / storage
shared             →  (no chrome APIs except types)
```

Do not import content modules from background or the reverse.

## Commands

```bash
npm test              # vitest
npm run verify        # lint + test + build + validate-manifest
npm run build         # Chrome dist/ (service_worker)
npm run build:firefox # build + patch dist for Firefox
npm run firefox:load  # patch + open about:debugging (does not auto-inject)
```

Firefox sideload: `about:debugging#/runtime/this-firefox` → Load Temporary
Add-on → `dist/manifest.json`. Unsigned add-ons do not survive a full quit.

## Hard bans

- **Do not start Firefox with `--marionette` / WebDriver against the user’s
  real profile.** That writes `browser.newtabpage.activity-stream.testing.shouldInitializeFeeds=false`
  and dummy settings/update servers, which blanks new tab (no clock/weather).
  Load via `about:debugging` only. Prefs backup from the incident:
  `/tmp/firefox-prefs.js.bak-before-marionette-cleanup`.
- Permissions stay exactly `storage` + `scripting`. No `<all_urls>`, no extra
  host patterns without a product decision. Content scripts match only the two
  LeetCode origins.
- Remote data is JSON only. Do not execute remote JS. First install still
  requires rating + level + all 12 plans before cache write — do not silently
  weaken that without a spec.
- Status is `chrome.storage.session`, keyed by host + username. Do not persist
  solve state to `local` without an explicit privacy decision.
- Topic multi-select is **union** of `allProblemIds`, then intersect other
  filters. Do not change that to AND without a spec.
- Training Mode mounts only on pathname `/problemset/`. Session is
  `lc-training:session` `{ active, page }` in `chrome.storage.local`. Leave
  `/problemset/` unmounts the panel but does not clear `active`. **退出训练**
  is the only off switch. Status cache is dropped when leaving `/problems/…`
  (`INVALIDATE_STATUS`). Spec:
  `docs/superpowers/specs/2026-09-19-training-session-restore-design.md`.
- Native overlay **replaces** Easy/Medium/Hard text. Do not make that more
  aggressive. Turning it off / making it additive needs a design.
- Do not fetch or run translation APIs at extension runtime. English 题单
  strings are bundled (`scripts/generate-study-translations.py` is
  maintainers-only).
- Arithmetic-level JSON is GPL-3.0 (`zhang-wangz/LeetCodeRating`). Do not
  vendor that project’s source. Store listing / redistribution is a legal
  question — ask the human partner.
- `gecko.id` is `leetcode-training-mode@gouyuanshuo`. Firefox dist must use
  `background.scripts` (not `service_worker`) and must **omit**
  `use_dynamic_url` (Firefox warns; Chrome CRXJS may emit it).

## Tests that lock behavior

| File | Locks |
| --- | --- |
| `tests/filters.test.ts` | bucket boundaries, topic union, search, sort |
| `tests/pageStatusSync.test.ts` | GraphQL status mapping / paging |
| `tests/problemMatcher.test.ts` | href / row matching |
| `tests/studyData.test.ts` | 12 plans, heading translations, ≥2000 problem ids |
| `scripts/validate-manifest.mjs` | MV3, permission set, host allowlist |

A change to filter math, status strings, or the manifest must update the
matching test **first** (watch it fail).

## Product facts (do not “simplify” in copy)

- Three difficulty systems exist: LeetCode E/M/H, zerotrac **rating**, stormlevel
  **arithmetic level**. Training Mode hides E/M/H.
- Locale follows hostname (`leetcode.cn` → zh, else en), not browser language.
- Data: rating daily (`zerotrac`), arithmetic + 灵茶 plans weekly (`huxulm`,
  `zhang-wangz`). GitHub raw may fail on CN networks; first-run all-or-nothing.
- ICP today: 灵茶 / contest-rating grinders. Not NeetCode, not official plans.

## Close-out

1. `npm test` on the files you own, then `npm run verify` if the change can leak.
2. If you touched `manifest.config.ts` or `dist` shape, run `npm run build:firefox`
   and confirm `dist/manifest.json` has `background.scripts` and no
   `use_dynamic_url`.
3. Do not push unless asked. Do not commit secrets or `dist/`.
4. If you change a public type or filter contract, update this file in the
   same session.
