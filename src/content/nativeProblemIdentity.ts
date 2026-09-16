import type { NormalizedDataset, ProblemRecord } from "../shared/types";

export function problemFromHref(
  dataset: NormalizedDataset,
  href: string
): ProblemRecord | null {
  const match = href.match(/\/problems\/([^/?#]+)/);
  if (!match) return null;
  const id = dataset.problemIdBySlug[decodeURIComponent(match[1])];
  return id ? dataset.problems[id] ?? null : null;
}

function problemIdsInText(
  dataset: NormalizedDataset,
  text: string
): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(
    /((?:LCP|LCR|LCS)\s*\d+|\d+)\.\s/gi
  )) {
    const raw = match[1].replace(/\s+/g, " ").trim();
    const normalized = /^(?:LCP|LCR|LCS)/i.test(raw)
      ? raw.toUpperCase()
      : raw;
    if (dataset.problems[normalized]) ids.add(normalized);
  }
  return [...ids];
}

export function resolveProblemForElement(
  dataset: NormalizedDataset,
  element: Element
): ProblemRecord | null {
  let current: Element | null = element;
  for (let depth = 0; current && depth < 12; depth += 1) {
    const linkedProblems = new Map<string, ProblemRecord>();
    for (const link of current.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/problems/"]'
    )) {
      const problem = problemFromHref(dataset, link.href);
      if (problem) linkedProblems.set(problem.id, problem);
    }
    if (linkedProblems.size === 1) {
      return linkedProblems.values().next().value ?? null;
    }

    const textProblemIds = problemIdsInText(
      dataset,
      current.textContent ?? ""
    );
    if (textProblemIds.length === 1) {
      return dataset.problems[textProblemIds[0]];
    }

    // Reaching a container with several questions means we have left the row.
    if (linkedProblems.size > 1 || textProblemIds.length > 1) return null;
    current = current.parentElement;
  }
  return null;
}
