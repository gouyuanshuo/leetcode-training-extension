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

export function problemNearElement(
  dataset: NormalizedDataset,
  element: Element,
  root: Document = document
): ProblemRecord | null {
  let current: Element | null = element;
  for (let depth = 0; current && depth < 12; depth += 1) {
    const problems = Array.from(
      current.querySelectorAll<HTMLAnchorElement>('a[href*="/problems/"]')
    )
      .map((link) => problemFromHref(dataset, link.href))
      .filter((problem): problem is ProblemRecord => problem != null);
    if (problems.length === 1) return problems[0];

    const rect = current.getBoundingClientRect();
    if (problems.length === 0 && rect.height > 0 && rect.height <= 120) {
      const id = current.textContent?.match(/(?:^|\s)(\d+)\.\s/)?.[1];
      if (id && dataset.problems[id]) return dataset.problems[id];
    }
    if (problems.length > 1) break;
    current = current.parentElement;
  }

  // LeetCode's problemset can use a column-oriented grid: title and
  // difficulty are siblings without a shared per-row ancestor. Match the
  // closest visible problem link on the same horizontal row as a fallback.
  const difficultyRect = element.getBoundingClientRect();
  if (difficultyRect.height <= 0) return null;
  const difficultyY = difficultyRect.top + difficultyRect.height / 2;
  let nearest: { problem: ProblemRecord; distance: number } | null = null;
  for (const link of root.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/problems/"]'
  )) {
    const problem = problemFromHref(dataset, link.href);
    if (!problem) continue;
    const linkRect = link.getBoundingClientRect();
    if (linkRect.height <= 0 || linkRect.width <= 0) continue;
    const linkY = linkRect.top + linkRect.height / 2;
    const distance = Math.abs(linkY - difficultyY);
    if (!nearest || distance < nearest.distance) {
      nearest = { problem, distance };
    }
  }
  return nearest && nearest.distance <= 44 ? nearest.problem : null;
}

