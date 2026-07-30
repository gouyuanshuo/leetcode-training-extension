"""Generate the bundled English study-plan heading map.

This is a development-only helper. The built extension reads the generated
JSON and never calls a translation service.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import re
import time
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen


PLAN_TITLES = {
    "binary_search": "二分查找",
    "bitwise_operations": "位运算",
    "data_structure": "数据结构",
    "dynamic_programming": "动态规划",
    "graph": "图论算法",
    "greedy": "贪心",
    "grid": "网格图",
    "math": "数学",
    "monotonic_stack": "单调栈",
    "sliding_window": "滑动窗口与双指针",
    "string": "字符串",
    "trees": "链表、二叉树与回溯",
}

PLAN_URL = "https://huxulm.github.io/lc-rating/studyplan/{key}.json"
TRANSLATE_URL = (
    "https://translate.googleapis.com/translate_a/single"
    "?client=gtx&sl=zh-CN&tl=en&dt=t&q={text}"
)


def read_plan(key: str, source_dir: Path | None) -> dict[str, Any]:
    if source_dir is not None:
        return json.loads((source_dir / f"{key}.json").read_text("utf-8"))
    request = Request(PLAN_URL.format(key=key), headers={"User-Agent": "lc-training-build"})
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def collect_sections(
    key: str,
    sections: list[dict[str, Any]],
    path: list[str],
    output: list[dict[str, str]],
    problem_refs: list[dict[str, str]],
) -> None:
    for section in sections:
        title = str(section["title"]).strip()
        next_path = [*path, title]
        output.append(
            {
                "key": f"{key}::{' > '.join(next_path)}",
                "titleZh": title,
            }
        )
        for problem in section.get("problems") or []:
            title = str(problem.get("title") or "")
            title_id = re.match(r"^\s*(\d+)\s*\.", title)
            problem_refs.append(
                {
                    "sectionKey": output[-1]["key"],
                    "id": str(problem.get("id") or (title_id.group(1) if title_id else "")),
                    "slug": str(problem.get("slug") or problem.get("src") or ""),
                }
            )
        collect_sections(
            key,
            section.get("children") or [],
            next_path,
            output,
            problem_refs,
        )


def translate(title: str) -> str:
    if not title:
        return "Untitled section"
    request = Request(
        TRANSLATE_URL.format(text=quote(title)),
        headers={"User-Agent": "Mozilla/5.0 lc-training-build"},
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            result = "".join(part[0] for part in payload[0] if part[0]).strip()
            if result:
                return result
        except Exception:
            if attempt == 2:
                raise
            time.sleep(0.5 * (2**attempt))
    raise RuntimeError(f"Unable to translate {title!r}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("src/data/studyTranslations.en.json"),
    )
    parser.add_argument(
        "--snapshot",
        type=Path,
        default=Path("src/data/studyHeadings.snapshot.json"),
    )
    args = parser.parse_args()

    headings: list[dict[str, str]] = []
    problem_refs: list[dict[str, str]] = []
    for key, root_title in PLAN_TITLES.items():
        plan = read_plan(key, args.source_dir)
        collect_sections(
            key,
            plan["children"],
            [root_title],
            headings,
            problem_refs,
        )

    previous: dict[str, str] = {}
    if args.output.exists():
        previous = json.loads(args.output.read_text("utf-8"))

    titles = sorted({heading["titleZh"] for heading in headings})
    translated_titles: dict[str, str] = {}
    for heading in headings:
        cached = previous.get(heading["key"])
        if cached:
            translated_titles[heading["titleZh"]] = cached

    missing = [title for title in titles if title not in translated_titles]
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(translate, title): title for title in missing}
        for future in as_completed(futures):
            title = futures[future]
            translated_titles[title] = future.result()

    translations = {
        heading["key"]: translated_titles[heading["titleZh"]]
        for heading in headings
    }
    args.output.write_text(
        json.dumps(translations, ensure_ascii=False, indent=2) + "\n",
        "utf-8",
    )
    args.snapshot.write_text(
        json.dumps(
            {
                "headings": headings,
                "problemRefs": problem_refs,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        "utf-8",
    )
    print(
        f"Generated {len(translations)} translations "
        f"({len(translated_titles)} unique headings) and "
        f"{len(problem_refs)} problem references."
    )


if __name__ == "__main__":
    main()
