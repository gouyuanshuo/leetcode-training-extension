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

export function pageAfterFilterUpdate(
  isHydration: boolean,
  restoredPage: number
): number {
  return isHydration ? restoredPage : 1;
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

export function pagePersistWrite(
  cancelled: boolean,
  raw: unknown,
  page: number
): TrainingSession | null {
  if (cancelled) return null;
  const session = normalizeSession(raw);
  const next = nextSession(session, { type: "page-change", page });
  if (next.page === session.page && next.active === session.active) return null;
  return next;
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

export function sessionWriteFromStorage(
  raw: unknown,
  event: SessionEvent
): TrainingSession {
  return nextSession(normalizeSession(raw), event);
}

export function urlChangeSteps(
  prevPathname: string,
  nextPathname: string
): Array<"invalidate" | "unmount"> {
  const steps: Array<"invalidate" | "unmount"> = [];
  if (shouldInvalidateStatusCache(prevPathname, nextPathname)) {
    steps.push("invalidate");
  }
  if (!isProblemsetHome(nextPathname)) {
    steps.push("unmount");
  }
  return steps;
}

export function shouldMountTraining(
  pathname: string,
  active: boolean,
  mounted: boolean
): boolean {
  return isProblemsetHome(pathname) && active && !mounted;
}

export function storedSessionRestore(
  pathname: string,
  raw: unknown,
  mounted: boolean
): {
  session: TrainingSession;
  unmount: boolean;
  restore: boolean;
} {
  const session = normalizeSession(raw);
  return {
    session,
    unmount: !session.active && mounted,
    restore: shouldMountTraining(pathname, session.active, mounted)
  };
}

export function canBeginOpenTraining(
  inFlight: boolean,
  pathname: string,
  mounted: boolean
): boolean {
  return !inFlight && !mounted && isProblemsetHome(pathname);
}

export function shouldQueueRestore(
  restore: boolean,
  inFlight: boolean
): boolean {
  return restore && !inFlight;
}
