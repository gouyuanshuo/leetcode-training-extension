# LeetCode Training Mode

一个同时支持 `leetcode.cn` 和 `leetcode.com` 的 Chrome Manifest V3
扩展。它在 LeetCode 原题库中加入可开关的训练模式，并在原生列表和单题页显示
周赛 Rating 与算术评级。

## 安装

1. 先停用旧的 Tampermonkey LeetCodeRating 脚本，避免重复渲染。
2. 打开 `chrome://extensions`。
3. 开启右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择本项目的 `dist` 目录。
5. 打开 `https://leetcode.cn/problemset/` 或
   `https://leetcode.com/problemset/`，点击右下角“训练模式”。

ZIP 是可分发副本；Chrome 的“加载已解压”功能仍需先把 ZIP 解压。

## 功能

- 双站题库、题单和单题页显示周赛 Rating 与算术评级。
- `/problemset` 训练模式，关闭或 SPA 跳转时恢复 LeetCode 原列表。
- 固定 Rating 分段、题号/标题搜索、状态筛选、列排序和每页 50 题。
- 12 个灵茶山题单的多级多选树；章节多选取并集，再与其他条件取交集。
- 登录后从当前 LeetCode 域名同步 `TO_DO`、`ATTEMPTED`、`SOLVED`。
- 中英文界面；当前上游 414 个章节均有内置英文译文，未来新章节暂时回退中文。
- 深浅主题适配，训练界面使用 Shadow DOM 与站点样式隔离。

## 数据与隐私

- 周赛 Rating：每天检查一次
  `zerotrac/leetcode_problem_rating`。
- 算术评级：每七天检查一次
  `zhang-wangz/LeetCodeRating/stormlevel`。
- 题单：每七天检查一次 `huxulm/lc-rating` 的 12 份 studyplan JSON。
- 远程仅下载 JSON，不加载或执行远程 JavaScript。
- 首次安装只有在三个数据切片全部解析、校验成功后才写入缓存；以后单个来源失败会保留
  上一份完整数据。
- 做题状态使用当前页面的同源 GraphQL 请求，最多 3 个并发；429/5xx 最多重试两次。
- 状态只保存在 `chrome.storage.session`，按域名和用户名隔离，关闭浏览器会话后失效。
- 扩展不读取 cookie，不上传账号、做题记录或其他个人数据。

## 开发与验证

需要 Node.js 20.19+ 或 22.12+：

```bash
npm install
npm run verify
```

生产构建输出到 `dist`。英文题单译表的开发时生成命令：

```bash
python scripts/generate-study-translations.py
```

生成脚本会下载公开题单标题并调用翻译服务；生成后的 JSON 被直接打包，扩展运行时不调用
翻译服务。

## 权限

- `storage`：保存归一化数据、筛选条件和会话状态。
- `scripting`：在当前 LeetCode 页面主世界执行同源状态查询。
- Host permissions 仅限两个 LeetCode 域名及计划中的数据源域名。

第三方来源、作者与许可证见 `THIRD_PARTY_NOTICES.md`。本项目不是 LeetCode
官方产品。

