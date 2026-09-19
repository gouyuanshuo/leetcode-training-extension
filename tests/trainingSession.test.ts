import { describe, expect, it } from "vitest";
import { STATUS_SESSION_PREFIX } from "../src/shared/config";
import {
  DEFAULT_TRAINING_SESSION,
  canBeginOpenTraining,
  isProblemPage,
  isProblemsetHome,
  nextSession,
  normalizeSession,
  pageAfterFilterUpdate,
  pagePersistWrite,
  selectStatusCacheKeys,
  sessionPersistWrite,
  sessionWriteFromStorage,
  shouldInvalidateStatusCache,
  shouldMountTraining,
  shouldPersistOpenWrite,
  shouldQueueRestore,
  statusCacheKeyPrefix,
  storedSessionRestore,
  toggleClickAction,
  toggleMessageKey,
  urlChangeSteps
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

describe("sessionWriteFromStorage", () => {
  it("applies open to the stored snapshot so a stale in-memory page is not written", () => {
    const staleMemory = { active: true, page: 1 };
    const stored = { active: true, page: 2 };
    expect(nextSession(staleMemory, { type: "open" })).toEqual({
      active: true,
      page: 1
    });
    expect(sessionWriteFromStorage(stored, { type: "open" })).toEqual({
      active: true,
      page: 2
    });
  });
});

describe("urlChangeSteps", () => {
  it("invalidates before restore when leaving a problem for problemset", () => {
    expect(urlChangeSteps("/problems/two-sum", "/problemset/")).toEqual([
      "invalidate"
    ]);
    expect(
      urlChangeSteps("/problems/two-sum/solutions", "/problemset/")
    ).toEqual(["invalidate"]);
  });

  it("unmounts without invalidating when leaving problemset for a problem", () => {
    expect(urlChangeSteps("/problemset/", "/problems/two-sum")).toEqual([
      "unmount"
    ]);
  });

  it("invalidates before unmount when leaving a problem for a non-problemset page", () => {
    expect(urlChangeSteps("/problems/two-sum", "/contest/")).toEqual([
      "invalidate",
      "unmount"
    ]);
  });
});

describe("shouldMountTraining", () => {
  it("requires problemset home, an active session, and no existing host", () => {
    expect(shouldMountTraining("/problemset/", true, false)).toBe(true);
    expect(shouldMountTraining("/problemset", true, false)).toBe(true);
    expect(shouldMountTraining("/problems/two-sum", true, false)).toBe(false);
    expect(shouldMountTraining("/problemset/", false, false)).toBe(false);
    expect(shouldMountTraining("/problemset/", true, true)).toBe(false);
  });
});

describe("storedSessionRestore", () => {
  it("unmounts when storage is inactive even if this tab still has a host", () => {
    expect(
      storedSessionRestore("/problemset/", { active: false, page: 1 }, true)
    ).toEqual({
      session: { active: false, page: 1 },
      unmount: true,
      restore: false
    });
  });

  it("restores when storage is active, home, and unmounted", () => {
    expect(
      storedSessionRestore("/problemset/", { active: true, page: 2 }, false)
    ).toEqual({
      session: { active: true, page: 2 },
      unmount: false,
      restore: true
    });
  });

  it("does not restore off problemset home", () => {
    expect(
      storedSessionRestore("/problems/two-sum", { active: true, page: 2 }, false)
    ).toEqual({
      session: { active: true, page: 2 },
      unmount: false,
      restore: false
    });
  });
});

describe("canBeginOpenTraining", () => {
  it("blocks a second open while a click-to-open is already in flight", () => {
    expect(canBeginOpenTraining(false, "/problemset/", false)).toBe(true);
    expect(canBeginOpenTraining(true, "/problemset/", false)).toBe(false);
    expect(canBeginOpenTraining(false, "/problemset/", true)).toBe(false);
    expect(canBeginOpenTraining(false, "/problems/two-sum", false)).toBe(false);
  });
});

describe("shouldQueueRestore", () => {
  it("does not queue restore when click-to-open already claimed the in-flight slot", () => {
    expect(shouldQueueRestore(true, false, "ready")).toBe(true);
    expect(shouldQueueRestore(true, true, "ready")).toBe(false);
    expect(shouldQueueRestore(false, false, "ready")).toBe(false);
  });

  it("does not retry restore after a dataset hard-fail", () => {
    expect(shouldQueueRestore(true, false, "failed")).toBe(false);
    expect(shouldQueueRestore(true, false, "loading")).toBe(true);
  });
});

describe("shouldPersistOpenWrite", () => {
  it("writes open only from the click path, not restore", () => {
    expect(shouldPersistOpenWrite("click")).toBe(true);
    expect(shouldPersistOpenWrite("restore")).toBe(false);
  });
});

describe("sessionPersistWrite", () => {
  it("skips storage when open is applied to an already-active snapshot", () => {
    expect(
      sessionPersistWrite({ active: true, page: 2 }, { type: "open" })
    ).toBeNull();
  });

  it("writes open when the stored snapshot is inactive", () => {
    expect(
      sessionPersistWrite({ active: false, page: 2 }, { type: "open" })
    ).toEqual({ active: true, page: 2 });
  });
});
