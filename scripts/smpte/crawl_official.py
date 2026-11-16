#!/usr/bin/env python3
"""Fetch the public pub.smpte.org family pages into .cache/smpte/official.

Only metadata pages (titles, states, version lists) are fetched; document
bodies are never downloaded here.
"""
from __future__ import annotations

import argparse
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "smpte" / "official"
BASE = "https://pub.smpte.org"
UA = "SMPTE-index-builder/0.1 (personal research index; contact: site owner)"


def get(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=30) as resp:
        return resp.read()


def fetch_family(fam: str, force: bool) -> tuple[str, str]:
    out = CACHE / f"{fam}.html"
    if out.exists() and not force:
        return fam, "cached"
    for attempt in range(3):
        try:
            out.write_bytes(get(f"{BASE}/doc/{fam}/"))
            return fam, "ok"
        except Exception as exc:  # noqa: BLE001
            if attempt == 2:
                return fam, f"error: {exc}"
            time.sleep(1 + attempt)
    return fam, "error"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-fetch pages already in cache")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    index = get(BASE + "/doc/").decode("utf-8", errors="replace")
    fams = sorted(set(re.findall(r'href="/doc/([a-z][a-z0-9.\\-]*)/"', index)))
    if args.limit:
        fams = fams[:args.limit]
    print(f"official families: {len(fams)}")
    ok = cached = failed = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(fetch_family, f, args.force): f for f in fams}
        for i, fut in enumerate(as_completed(futures), 1):
            fam, status = fut.result()
            if status == "ok":
                ok += 1
            elif status == "cached":
                cached += 1
            else:
                failed += 1
                print(f"  FAIL {fam}: {status}")
            if i % 100 == 0:
                print(f"  {i}/{len(fams)}")
    if not args.limit and (ok > 0 or not (CACHE / "_snapshot.json").exists()) and failed == 0:
        meta = {
            "crawled_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "families": len(fams),
            "source": BASE + "/doc/",
        }
        (CACHE / "_snapshot.json").write_text(__import__("json").dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"done: {ok} fetched, {cached} cached, {failed} failed -> {CACHE}")


if __name__ == "__main__":
    main()
