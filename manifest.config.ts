import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "LeetCode Training Mode",
  version: "1.0.0",
  description:
    "Adds contest ratings, arithmetic levels, Lingcha study-plan filters, and a native training mode to LeetCode.",
  permissions: ["storage", "scripting"],
  host_permissions: [
    "https://leetcode.com/*",
    "https://leetcode.cn/*",
    "https://raw.githubusercontent.com/*",
    "https://zerotrac.github.io/*",
    "https://huxulm.github.io/*"
  ],
  background: {
    service_worker: "src/background/index.ts",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["https://leetcode.com/*", "https://leetcode.cn/*"],
      js: ["src/content/index.tsx"],
      run_at: "document_idle"
    }
  ]
});
