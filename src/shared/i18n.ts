import type { Locale } from "./types";

const messages = {
  zh: {
    trainingMode: "训练模式",
    closeTraining: "退出训练",
    loading: "正在加载训练数据…",
    loadFailed: "训练数据暂时不可用",
    retry: "重试",
    refreshData: "刷新数据",
    refreshing: "刷新中…",
    rating: "难度分",
    arithmeticLevel: "算术评级",
    all: "全部",
    unrated: "未定级",
    searchPlaceholder: "搜索题号或标题",
    studyPlans: "灵茶山题单",
    clearTopics: "清除题型",
    selectedTopics: "已选 {count} 个章节",
    status: "做题状态",
    todo: "未做",
    attempted: "尝试过",
    solved: "已解决",
    loginForStatus: "登录 LeetCode 后可同步做题状态",
    syncingStatus: "正在同步做题状态…",
    syncStatus: "同步状态",
    syncFailed: "状态同步失败，暂不按状态筛选",
    problem: "题目",
    topics: "所属题型",
    premium: "会员题",
    noResults: "没有符合条件的题目",
    previous: "上一页",
    next: "下一页",
    page: "第 {page} / {pages} 页",
    resultCount: "共 {count} 题",
    untranslated: "新章节暂未翻译",
    sourcePrefix: "数据来源",
    updated: "数据已更新",
    staleCache: "远程更新失败，正在使用本地缓存"
  },
  en: {
    trainingMode: "Training Mode",
    closeTraining: "Exit Training",
    loading: "Loading training data…",
    loadFailed: "Training data is temporarily unavailable",
    retry: "Retry",
    refreshData: "Refresh data",
    refreshing: "Refreshing…",
    rating: "Rating",
    arithmeticLevel: "Arithmetic level",
    all: "All",
    unrated: "Unrated",
    searchPlaceholder: "Search by problem ID or title",
    studyPlans: "Lingcha Study Plans",
    clearTopics: "Clear topics",
    selectedTopics: "{count} sections selected",
    status: "Status",
    todo: "To do",
    attempted: "Attempted",
    solved: "Solved",
    loginForStatus: "Sign in to LeetCode to sync problem status",
    syncingStatus: "Syncing problem status…",
    syncStatus: "Sync status",
    syncFailed: "Status sync failed; status filtering is unavailable",
    problem: "Problem",
    topics: "Study-plan sections",
    premium: "Premium",
    noResults: "No problems match these filters",
    previous: "Previous",
    next: "Next",
    page: "Page {page} / {pages}",
    resultCount: "{count} problems",
    untranslated: "New section not translated yet",
    sourcePrefix: "Sources",
    updated: "Data updated",
    staleCache: "Remote update failed; using cached data"
  }
} as const;

export type MessageKey = keyof (typeof messages)["en"];

export function t(
  locale: Locale,
  key: MessageKey,
  variables: Record<string, string | number> = {}
): string {
  let value: string = messages[locale][key];
  for (const [name, replacement] of Object.entries(variables)) {
    value = value.replace(`{${name}}`, String(replacement));
  }
  return value;
}

export function localeForHost(hostname: string): Locale {
  return hostname.endsWith("leetcode.cn") ? "zh" : "en";
}
