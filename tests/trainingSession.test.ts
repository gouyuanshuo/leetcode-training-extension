import { describe, expect, it } from "vitest";
import { STATUS_SESSION_PREFIX } from "../src/shared/config";
import {
  DEFAULT_TRAINING_SESSION,
  isProblemPage,
  isProblemsetHome,
  nextSession,
  normalizeSession,
  pageAfterFilterUpdate,
  pagePersistWrite,
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

describe("pageAfterFilterUpdate", () => {
  it("keeps the restored page on the first hydrate, then resets to 1", () => {
    expect(pageAfterFilterUpdate(true, 2)).toBe(2);
    expect(pageAfterFilterUpdate(false, 2)).toBe(1);
  });
});

describe("pagePersistWrite", () => {
  it("does not write after unmount even if get resolved with an active session", () => {
    expect(
      pagePersistWrite(true, { active: true, page: 2 }, 3)
    ).toBeNull();
  });

  it("writes page-change while mounted and active", () => {
    expect(
      pagePersistWrite(false, { active: true, page: 2 }, 3)
    ).toEqual({ active: true, page: 3 });
  });

  it("does not write when the fresh snapshot is inactive", () => {
    expect(
      pagePersistWrite(false, { active: false, page: 1 }, 3)
    ).toBeNull();
  });
});
