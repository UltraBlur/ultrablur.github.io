#!/usr/bin/env python3
"""OCR fallback for image-only SMPTE PDFs.

Renders pages with PyMuPDF and runs the local Tesseract CLI (eng).
Results are cached by PDF SHA-1 under .cache/smpte/ocr/.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "smpte" / "ocr"
TESS = os.environ.get("TESSERACT") or shutil.which("tesseract") or "/opt/homebrew/bin/tesseract"
DPI = int(os.environ.get("SMPTE_OCR_DPI", "300"))
MAX_TEXT = 160_000

LIG = {"\ufb01": "fi", "\ufb02": "fl", "\ufb00": "ff", "\ufb03": "ffi", "\ufb04": "ffl"}


def clean_text(t: str) -> str:
    for a, b in LIG.items():
        t = t.replace(a, b)
    t = t.replace("\u00ad", "").replace("\u00a0", " ")
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    t = t.replace("\x0c", "\n")
    t = t.replace("|", " ")
    t = t.replace("ﬁ", "fi").replace("ﬂ", "fl")
    t = __import__("re").sub(r"(?<=\w)-\n(?=\w)", "", t)
    t = __import__("re").sub(r"[ \t]+", " ", t)
    t = __import__("re").sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def sha1_file(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ocr_pdf(path: Path, dpi: int = DPI, lang: str = "eng", verbose: bool = True) -> dict:
    key = sha1_file(path)
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE / f"{key}.json"
    if cache_path.exists():
        try:
            return json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    import concurrent.futures

    import pymupdf as fitz

    doc = fitz.open(path)
    pages = doc.page_count
    texts: list[str] = []
    workers = max(1, int(os.environ.get("SMPTE_OCR_WORKERS", "4")))
    with tempfile.TemporaryDirectory(prefix="smpte-ocr-") as td:
        images = []
        for i in range(pages):
            pix = doc[i].get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
            img = os.path.join(td, f"p{i:03d}.png")
            pix.save(img)
            images.append(img)

        def run(img: str) -> str:
            proc = subprocess.run(
                [TESS, img, "stdout", "-l", lang, "--psm", "3", "--dpi", str(dpi)],
                capture_output=True, text=True,
            )
            return proc.stdout or ""

        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            for i, txt in enumerate(pool.map(run, images), 1):
                texts.append(txt)
                if verbose and i % 5 == 0:
                    print(f"    ocr {path.name}: {i}/{pages}", flush=True)
    text = clean_text("\n\n".join(texts))[:MAX_TEXT]
    data = {
        "text": text,
        "pages": pages,
        "outline": [],
        "scanned": False,
        "ocr": True,
        "ocr_dpi": dpi,
        "ocr_engine": f"tesseract {subprocess.run([TESS, '--version'], capture_output=True, text=True).stdout.splitlines()[0] if TESS else 'tesseract'}",
        "sha1": key,
    }
    cache_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", nargs="+")
    args = ap.parse_args()
    for p in args.pdf:
        d = ocr_pdf(Path(p))
        print(f"{p}: {len(d['text'])} chars, {d['pages']} pages")
