import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getLeetCodeUserInPage,
  syncStatusInPage
} from "../src/background/pageStatusSync";

function response(
  payload: unknown,
  status = 200
): Pick<Response, "ok" | "status" | "json"> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function installWindow(fetch: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal("window", {
    fetch,
    setTimeout: (callback: () => void) => {
      callback();
      return 0;
    }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LeetCode status synchronization", () => {
  it("detects a signed-out page without treating problems as to-do", async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        data: { userStatus: { isSignedIn: false, username: null } }
      })
    );
    installWindow(fetch);
    await expect(getLeetCodeUserInPage()).resolves.toEqual({
      signedIn: false,
      username: null
    });
    await expect(syncStatusInPage()).resolves.toMatchObject({
      signedIn: false,
      statuses: {}
    });
  });

  it("loads all pages and keeps only known status values", async () => {
    const page = (
      skip: number,
      questions: Array<{ titleSlug: string; status: string | null }>
    ) => ({
      data: {
        problemsetQuestionListV2: {
          questions,
          totalLength: 250,
          hasMore: skip < 200
        }
      }
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          data: { userStatus: { isSignedIn: true, username: "alice" } }
        })
      )
      .mockResolvedValueOnce(
        response(
          page(0, [
            { titleSlug: "two-sum", status: "SOLVED" },
            { titleSlug: "new-question", status: null },
            { titleSlug: "unknown-status", status: "FUTURE_ENUM" }
          ])
        )
      )
      .mockResolvedValueOnce(
        response(page(100, [{ titleSlug: "add-two-numbers", status: "ATTEMPTED" }]))
      )
      .mockResolvedValueOnce(
        response(page(200, [{ titleSlug: "median", status: "TO_DO" }]))
      );
    installWindow(fetch);

    const result = await syncStatusInPage();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      signedIn: true,
      username: "alice",
      statuses: {
        "two-sum": "SOLVED",
        "new-question": "TO_DO",
        "add-two-numbers": "ATTEMPTED",
        median: "TO_DO"
      }
    });
    expect(result.statuses["unknown-status"]).toBeUndefined();
  });

  it("retries HTTP 429 and 5xx responses at most twice", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({}, 429))
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(
        response({
          data: { userStatus: { isSignedIn: true, username: "retry-user" } }
        })
      )
      .mockResolvedValueOnce(
        response({
          data: {
            problemsetQuestionListV2: {
              questions: [{ titleSlug: "two-sum", status: "SOLVED" }],
              totalLength: 1,
              hasMore: false
            }
          }
        })
      );
    installWindow(fetch);

    const result = await syncStatusInPage();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result.statuses["two-sum"]).toBe("SOLVED");
  });
});
