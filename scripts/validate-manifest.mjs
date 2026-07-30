import { access, readFile } from "node:fs/promises";
import path from "node:path";

const manifestPath = path.resolve("dist/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(`Manifest validation failed: ${message}`);
}

assert(manifest.manifest_version === 3, "manifest_version must be 3");
assert(
  JSON.stringify([...manifest.permissions].sort()) ===
    JSON.stringify(["scripting", "storage"]),
  "permissions must be exactly storage and scripting"
);
assert(
  !manifest.host_permissions.some(
    (pattern) => pattern === "<all_urls>" || pattern.includes("*://*")
  ),
  "broad host permissions are forbidden"
);
assert(
  manifest.content_scripts.every((script) =>
    script.matches.every(
      (pattern) =>
        pattern.startsWith("https://leetcode.com/") ||
        pattern.startsWith("https://leetcode.cn/")
    )
  ),
  "content scripts may only match the two LeetCode domains"
);

const referencedFiles = [
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((script) => script.js)
];
for (const filename of referencedFiles) {
  await access(path.resolve("dist", filename));
}

console.log(
  `Validated MV3 manifest (${manifest.permissions.length} permissions, ` +
    `${manifest.host_permissions.length} host patterns).`
);

