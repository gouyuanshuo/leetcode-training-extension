import type { ProblemStatus, StatusSyncResult } from "../shared/types";

export interface PageUser {
  signedIn: boolean;
  username: string | null;
}

export async function getLeetCodeUserInPage(): Promise<PageUser> {
  const query = `
    query globalData {
      userStatus {
        isSignedIn
        username
        userSlug
      }
    }
  `;
  const response = await window.fetch("/graphql/", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: {}, operationName: "globalData" })
  });
  if (!response.ok) throw new Error(`User query failed: HTTP ${response.status}`);
  const payload = await response.json();
  const user = payload?.data?.userStatus;
  return {
    signedIn: Boolean(user?.isSignedIn),
    username: user?.username ?? user?.userSlug ?? null
  };
}

export async function syncStatusInPage(): Promise<StatusSyncResult> {
  const sleep = (delay: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, delay));

  const requestGraphql = async (
    query: string,
    variables: Record<string, unknown>,
    operationName: string
  ) => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await window.fetch("/graphql/", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-operation-name": operationName
          },
          body: JSON.stringify({ query, variables, operationName })
        });
        if (
          response.status === 429 ||
          (response.status >= 500 && response.status <= 599)
        ) {
          throw new Error(`HTTP ${response.status}`);
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (payload?.errors?.length) {
          throw new Error(payload.errors[0]?.message ?? "GraphQL error");
        }
        return payload.data;
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));
        if (attempt < 2) await sleep(400 * 2 ** attempt);
      }
    }
    throw lastError ?? new Error("GraphQL request failed");
  };

  const userQuery = `
    query globalData {
      userStatus {
        isSignedIn
        username
        userSlug
      }
    }
  `;
  const userData = await requestGraphql(userQuery, {}, "globalData");
  const user = userData?.userStatus;
  if (!user?.isSignedIn) {
    return {
      signedIn: false,
      username: null,
      statuses: {},
      syncedAt: Date.now()
    };
  }

  const username = user.username ?? user.userSlug ?? "unknown";
  const listQuery = `
    query problemsetQuestionListV2(
      $categorySlug: String
      $limit: Int
      $skip: Int
    ) {
      problemsetQuestionListV2(
        categorySlug: $categorySlug
        limit: $limit
        skip: $skip
      ) {
        questions {
          titleSlug
          questionFrontendId
          status
        }
        totalLength
        finishedLength
        hasMore
      }
    }
  `;

  const fetchPage = async (skip: number) => {
    const data = await requestGraphql(
      listQuery,
      { categorySlug: "all-code-essentials", limit: 100, skip },
      "problemsetQuestionListV2"
    );
    return data?.problemsetQuestionListV2;
  };

  const firstPage = await fetchPage(0);
  if (!firstPage || !Array.isArray(firstPage.questions)) {
    throw new Error("Problem status response was invalid");
  }
  const total = Number(firstPage.totalLength) || firstPage.questions.length;
  const pages = Math.ceil(total / 100);
  const pageResults: any[] = [firstPage];
  let nextPage = 1;

  const worker = async () => {
    while (nextPage < pages) {
      const page = nextPage;
      nextPage += 1;
      pageResults[page] = await fetchPage(page * 100);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(3, Math.max(0, pages - 1)) }, worker)
  );

  const statuses: Record<string, ProblemStatus> = {};
  for (const page of pageResults) {
    for (const question of page?.questions ?? []) {
      const slug = String(question?.titleSlug ?? "");
      const rawStatus = String(question?.status ?? "").toUpperCase();
      const status: ProblemStatus | null =
        rawStatus === "SOLVED" ||
        rawStatus === "AC" ||
        rawStatus === "ACCEPTED"
          ? "SOLVED"
          : rawStatus === "ATTEMPTED" ||
              rawStatus === "TRIED" ||
              rawStatus === "NOT_AC" ||
              rawStatus === "NOTAC"
            ? "ATTEMPTED"
            : rawStatus === "" ||
                rawStatus === "TO_DO" ||
                rawStatus === "NOT_STARTED"
              ? "TO_DO"
              : null;
      if (slug && status) statuses[slug] = status;
    }
  }

  return {
    signedIn: true,
    username,
    statuses,
    syncedAt: Date.now()
  };
}
