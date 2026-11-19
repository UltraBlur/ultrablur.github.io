#!/usr/bin/env python3
"""发布规则干跑：按策略文件审计 base..HEAD 的变更范围；不推送、不访问网络。

用途：在 release worktree 里、push 之前，确认这次范围不会带出内部/暂缓文件、
未分类新文件、敏感提交信息或标记词、加密目录明文。

用法：
    python3 scripts/verify/guard_dryrun.py --base main
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NEVER, HOLD, REVIEW, PUBLIC = 3, 2, 1, 0
CLASS_LABEL = {NEVER: "内部", HOLD: "暂缓", REVIEW: "复核", PUBLIC: "公开"}


def path_matches(path: str, pattern: str) -> bool:
    if pattern.endswith("/**"):
        base = pattern[:-3]
        return path == base or path.startswith(base + "/")
    return fnmatch.fnmatch(path, pattern)


def classify(path: str, policy: dict) -> int:
    for key, cls in (("never", NEVER), ("hold", HOLD), ("review", REVIEW)):
        if any(path_matches(path, pat) for pat in policy.get(key, [])):
            return cls
    return PUBLIC


def is_new_unclassified(path: str, policy: dict) -> bool:
    if classify(path, policy) != PUBLIC:
        return False
    return not any(path_matches(path, pat) for pat in policy.get("allow_new", []))


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
    ).stdout


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="main", help="对比的基线（默认 main）")
    ap.add_argument("--head", default="HEAD", help="候选提交（默认 HEAD）")
    ap.add_argument(
        "--policy", default=os.environ.get("UB_PREFLIGHT_POLICY", ""), help="策略文件（或 UB_PREFLIGHT_POLICY）"
    )
    args = ap.parse_args()

    if not args.policy or not Path(args.policy).is_file():
        print("需要 --policy 或 UB_PREFLIGHT_POLICY 指向策略文件")
        return 2
    policy = json.loads(Path(args.policy).read_text(encoding="utf-8"))
    failures: list[str] = []

    entries: list[tuple[str, str]] = []
    for raw in git("diff", "--name-status", args.base, args.head).splitlines():
        parts = raw.split("\t")
        if len(parts) >= 2:
            entries.append((parts[0][:1], parts[-1]))

    for code, path in entries:
        if code == "D":
            continue
        cls = classify(path, policy)
        if cls >= HOLD:
            failures.append(f"{path}（{CLASS_LABEL[cls]}）")
        elif code == "A" and is_new_unclassified(path, policy):
            failures.append(f"{path}（未分类的新文件）")

    patterns = policy.get("forbidden_subject_patterns", [])
    for raw in git("log", "--format=%H%x1f%s%x1f%b%x1e", f"{args.base}..{args.head}").split("\x1e"):
        raw = raw.strip()
        if not raw:
            continue
        sha, _, message = raw.partition("\x1f")
        for pat in patterns:
            if re.search(pat, message):
                failures.append(f"提交信息含敏感字样（{pat}）：{sha[:7]}")
                break

    diff = git("diff", args.base, args.head)
    added = [ln[1:] for ln in diff.splitlines() if ln.startswith("+") and not ln.startswith("+++")]
    for marker in policy.get("markers", []):
        if any(marker in ln for ln in added):
            failures.append(f"新增内容含标记词：{marker}")

    encrypted = policy.get("encrypted", [])
    for code, path in entries:
        if code == "D" or not path.lower().endswith((".html", ".htm")):
            continue
        if not any(path_matches(path, pat) for pat in encrypted):
            continue
        blob = git("show", f"{args.head}:{path}")[:4096].lower()
        if "staticrypt" not in blob:
            failures.append(f"加密目录出现明文 HTML：{path}")

    if failures:
        print(f"✗ 发布规则干跑失败（{len(failures)} 项）")
        for item in failures:
            print("  - " + item)
        return 1
    print(f"✓ 发布规则干跑通过（{len(entries)} 个文件变更）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
