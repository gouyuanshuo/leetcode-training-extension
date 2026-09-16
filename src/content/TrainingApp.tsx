import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { FILTER_STORAGE_KEY } from "../shared/config";
import {
  DEFAULT_FILTER_STATE,
  filterAndSortProblems
} from "../shared/filters";
import { t } from "../shared/i18n";
import type {
  DataRefreshResult,
  FilterState,
  Locale,
  NormalizedDataset,
  ProblemRecord,
  ProblemStatus,
  RatingBucket,
  SortKey,
  StatusSyncResult,
  StudyNode
} from "../shared/types";

const PAGE_SIZE = 50;

const RATING_BUCKETS: Array<{
  key: RatingBucket;
  zh: string;
  en: string;
}> = [
  { key: "all", zh: "全部", en: "All" },
  { key: "unrated", zh: "未定级", en: "Unrated" },
  { key: "lt1200", zh: "<1200", en: "<1200" },
  { key: "1200-1399", zh: "1200–1399", en: "1200–1399" },
  { key: "1400-1599", zh: "1400–1599", en: "1400–1599" },
  { key: "1600-1899", zh: "1600–1899", en: "1600–1899" },
  { key: "1900-2099", zh: "1900–2099", en: "1900–2099" },
  { key: "2100-2399", zh: "2100–2399", en: "2100–2399" },
  { key: "gte2400", zh: "≥2400", en: "≥2400" }
];

interface TrainingAppProps {
  initialDataset: NormalizedDataset;
  locale: Locale;
  siteOrigin: string;
  initialWarnings: string[];
  onClose: () => void;
  onRefresh: () => Promise<{
    dataset: NormalizedDataset;
    result: DataRefreshResult;
  }>;
  onSyncStatus: (force: boolean) => Promise<StatusSyncResult>;
}

interface TopicTreeProps {
  dataset: NormalizedDataset;
  locale: Locale;
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function TopicTree({
  dataset,
  locale,
  selected,
  onToggle
}: TopicTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(dataset.planRootIds)
  );

  const renderNode = (node: StudyNode): ReactNode => {
    const hasChildren = node.childIds.length > 0;
    const isExpanded = expanded.has(node.id);
    const title =
      locale === "en" ? node.titleEn ?? node.titleZh : node.titleZh;

    return (
      <li key={node.id} className="topic-node">
        <div className="topic-row" style={{ paddingLeft: node.depth * 12 }}>
          <button
            type="button"
            className="tree-toggle"
            disabled={!hasChildren}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            onClick={() => {
              setExpanded((current) => {
                const next = new Set(current);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
              });
            }}
          >
            {hasChildren ? (isExpanded ? "▾" : "▸") : "·"}
          </button>
          <label title={node.untranslated ? t(locale, "untranslated") : title}>
            <input
              type="checkbox"
              checked={selected.has(node.id)}
              onChange={() => onToggle(node.id)}
            />
            <span>{title}</span>
            <small>{node.allProblemIds.length}</small>
            {locale === "en" && node.untranslated ? (
              <span className="translation-warning">!</span>
            ) : null}
          </label>
        </div>
        {hasChildren && isExpanded ? (
          <ul>
            {node.childIds.map((childId) =>
              renderNode(dataset.studyNodes[childId])
            )}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <ul className="topic-tree">
      {dataset.planRootIds.map((rootId) =>
        renderNode(dataset.studyNodes[rootId])
      )}
    </ul>
  );
}

function ratingClass(rating: number | null): string {
  if (rating == null) return "rating-unrated";
  if (rating < 1400) return "rating-low";
  if (rating < 1900) return "rating-mid";
  if (rating < 2400) return "rating-high";
  return "rating-elite";
}

function statusLabel(
  locale: Locale,
  status: ProblemStatus | undefined
): string {
  if (status === "SOLVED") return t(locale, "solved");
  if (status === "ATTEMPTED") return t(locale, "attempted");
  return t(locale, "todo");
}

function problemStudyPaths(
  problem: ProblemRecord,
  dataset: NormalizedDataset,
  locale: Locale
): string[] {
  return problem.directStudyNodeIds.slice(0, 3).map((nodeId) => {
    const path: string[] = [];
    let node = dataset.studyNodes[nodeId];
    while (node) {
      path.unshift(locale === "en" ? node.titleEn ?? node.titleZh : node.titleZh);
      node = node.parentId ? dataset.studyNodes[node.parentId] : undefined!;
    }
    return path.join(" › ");
  });
}

function SortHeader({
  active,
  direction,
  children,
  onClick
}: {
  active: boolean;
  direction: "asc" | "desc";
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="sort-header" onClick={onClick}>
      {children} {active ? (direction === "asc" ? "↑" : "↓") : ""}
    </button>
  );
}

export function TrainingApp({
  initialDataset,
  locale,
  siteOrigin,
  initialWarnings,
  onClose,
  onRefresh,
  onSyncStatus
}: TrainingAppProps) {
  const [dataset, setDataset] = useState(initialDataset);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [statuses, setStatuses] =
    useState<Record<string, ProblemStatus> | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(
    initialWarnings.length ? t(locale, "staleCache") : ""
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    void chrome.storage.local.get(FILTER_STORAGE_KEY).then((stored) => {
      const saved = stored[FILTER_STORAGE_KEY] as Partial<FilterState> | undefined;
      if (saved) setFilters({ ...DEFAULT_FILTER_STATE, ...saved });
      setFiltersLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (filtersLoaded) {
      void chrome.storage.local.set({ [FILTER_STORAGE_KEY]: filters });
    }
    setPage(1);
  }, [filters, filtersLoaded]);

  const syncStatus = useCallback(
    async (force: boolean) => {
      setSyncing(true);
      try {
        const result = await onSyncStatus(force);
        if (result.error) throw new Error(result.error);
        setSignedIn(result.signedIn);
        setStatuses(result.signedIn ? result.statuses : null);
        if (!result.signedIn) {
          setFilters((current) =>
            current.status === "all"
              ? current
              : { ...current, status: "all" }
          );
        }
      } catch {
        setSignedIn(null);
        setStatuses(null);
        setNotice(t(locale, "syncFailed"));
        setFilters((current) => ({ ...current, status: "all" }));
      } finally {
        setSyncing(false);
      }
    },
    [locale, onSyncStatus]
  );

  useEffect(() => {
    void syncStatus(false);
  }, [syncStatus]);

  const selectedNodes = useMemo(
    () => new Set(filters.selectedStudyNodeIds),
    [filters.selectedStudyNodeIds]
  );

  const problems = useMemo(
    () => filterAndSortProblems(dataset, filters, statuses, locale),
    [dataset, filters, locale, statuses]
  );
  const pageCount = Math.max(1, Math.ceil(problems.length / PAGE_SIZE));
  const visibleProblems = problems.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const updateFilter = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K]
  ) => setFilters((current) => ({ ...current, [key]: value }));

  const toggleSort = (key: SortKey) => {
    setFilters((current) => ({
      ...current,
      sortKey: key,
      sortDirection:
        current.sortKey === key && current.sortDirection === "asc"
          ? "desc"
          : "asc"
    }));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { dataset: refreshedDataset, result } = await onRefresh();
      setDataset(refreshedDataset);
      setNotice(
        result.warnings.length ? t(locale, "staleCache") : t(locale, "updated")
      );
    } catch {
      setNotice(t(locale, "staleCache"));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="training-shell">
      <header className="training-header">
        <div>
          <h2>{t(locale, "trainingMode")}</h2>
          <span>{t(locale, "resultCount", { count: problems.length })}</span>
        </div>
        <div className="header-actions">
          <button type="button" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? t(locale, "refreshing") : t(locale, "refreshData")}
          </button>
          <button
            type="button"
            onClick={() => void syncStatus(true)}
            disabled={syncing}
          >
            {syncing ? t(locale, "syncingStatus") : t(locale, "syncStatus")}
          </button>
          <button type="button" className="primary" onClick={onClose}>
            {t(locale, "closeTraining")}
          </button>
        </div>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}
      {signedIn === false ? (
        <div className="notice">{t(locale, "loginForStatus")}</div>
      ) : null}

      <div className="rating-filter" aria-label={t(locale, "rating")}>
        <strong>{t(locale, "rating")}</strong>
        {RATING_BUCKETS.map((bucket) => (
          <button
            type="button"
            key={bucket.key}
            className={filters.ratingBucket === bucket.key ? "active" : ""}
            onClick={() => updateFilter("ratingBucket", bucket.key)}
          >
            {bucket[locale]}
          </button>
        ))}
      </div>

      <div className="training-layout">
        <aside className="filters-panel">
          <div className="filter-title">
            <strong>{t(locale, "studyPlans")}</strong>
            <button
              type="button"
              className="link-button"
              onClick={() => updateFilter("selectedStudyNodeIds", [])}
            >
              {t(locale, "clearTopics")}
            </button>
          </div>
          <small>
            {t(locale, "selectedTopics", {
              count: filters.selectedStudyNodeIds.length
            })}
          </small>
          <TopicTree
            dataset={dataset}
            locale={locale}
            selected={selectedNodes}
            onToggle={(id) => {
              const next = new Set(selectedNodes);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              updateFilter("selectedStudyNodeIds", [...next]);
            }}
          />
        </aside>

        <main className="results-panel">
          <div className="result-controls">
            <input
              type="search"
              value={filters.search}
              placeholder={t(locale, "searchPlaceholder")}
              onChange={(event) => updateFilter("search", event.target.value)}
            />
            <label>
              {t(locale, "status")}
              <select
                value={filters.status}
                disabled={!signedIn || syncing}
                onChange={(event) =>
                  updateFilter(
                    "status",
                    event.target.value as FilterState["status"]
                  )
                }
              >
                <option value="all">{t(locale, "all")}</option>
                <option value="TO_DO">{t(locale, "todo")}</option>
                <option value="ATTEMPTED">{t(locale, "attempted")}</option>
                <option value="SOLVED">{t(locale, "solved")}</option>
              </select>
            </label>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t(locale, "status")}</th>
                  <th>
                    <SortHeader
                      active={filters.sortKey === "id"}
                      direction={filters.sortDirection}
                      onClick={() => toggleSort("id")}
                    >
                      #
                    </SortHeader>
                  </th>
                  <th>
                    <SortHeader
                      active={filters.sortKey === "title"}
                      direction={filters.sortDirection}
                      onClick={() => toggleSort("title")}
                    >
                      {t(locale, "problem")}
                    </SortHeader>
                  </th>
                  <th>{t(locale, "topics")}</th>
                  <th>
                    <SortHeader
                      active={filters.sortKey === "rating"}
                      direction={filters.sortDirection}
                      onClick={() => toggleSort("rating")}
                    >
                      {t(locale, "rating")}
                    </SortHeader>
                  </th>
                  <th>
                    <SortHeader
                      active={filters.sortKey === "arithmeticLevel"}
                      direction={filters.sortDirection}
                      onClick={() => toggleSort("arithmeticLevel")}
                    >
                      {t(locale, "arithmeticLevel")}
                    </SortHeader>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleProblems.map((problem) => {
                  const title =
                    locale === "en"
                      ? problem.titleEn || problem.titleZh
                      : problem.titleZh || problem.titleEn;
                  const status = statuses?.[problem.slug];
                  const paths = problemStudyPaths(problem, dataset, locale);
                  return (
                    <tr key={problem.id}>
                      <td>
                        <span
                          className={`status-dot status-${status ?? "UNKNOWN"}`}
                          title={statusLabel(locale, status)}
                        />
                      </td>
                      <td>{problem.id}</td>
                      <td>
                        <a
                          href={`${siteOrigin}/problems/${problem.slug}/`}
                          title={title}
                        >
                          {title}
                        </a>
                        {problem.premium ? (
                          <span className="premium" title={t(locale, "premium")}>
                            ◆
                          </span>
                        ) : null}
                      </td>
                      <td className="topic-paths">
                        {paths.map((path) => (
                          <span key={path}>{path}</span>
                        ))}
                        {problem.directStudyNodeIds.length > paths.length ? (
                          <small>
                            +{problem.directStudyNodeIds.length - paths.length}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        {problem.rating != null && problem.rating > 0 ? (
                          <span className={ratingClass(problem.rating)}>
                            {problem.rating}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {problem.arithmeticLevel != null &&
                        problem.arithmeticLevel > 0
                          ? problem.arithmeticLevel
                          : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleProblems.length === 0 ? (
              <div className="empty-state">{t(locale, "noResults")}</div>
            ) : null}
          </div>

          <nav className="pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {t(locale, "previous")}
            </button>
            <span>{t(locale, "page", { page, pages: pageCount })}</span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
            >
              {t(locale, "next")}
            </button>
          </nav>
        </main>
      </div>

      <footer>
        {t(locale, "sourcePrefix")}:{" "}
        <a href="https://github.com/zerotrac/leetcode_problem_rating">
          zerotrac (MIT)
        </a>
        {" · "}
        <a href="https://github.com/zhang-wangz/LeetCodeRating">
          LeetCodeRating (GPL-3.0)
        </a>
        {" · "}
        <a href="https://github.com/huxulm/lc-rating">
          huxulm/lc-rating (MIT)
        </a>
        {" · "}
        <a href="https://space.bilibili.com/206214/">灵茶山艾府</a>
      </footer>
    </div>
  );
}
