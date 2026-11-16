#!/usr/bin/env python3
"""Build the SMPTE document search catalog.

Sources
-------
1. Local mirror: ~/Downloads/SMPTE standards document 202606
   (PDFs, ZIP packages, HTML packages; used for full text only)
2. Official snapshot: pub.smpte.org family pages cached under .cache/smpte/official
   (authoritative titles, states, versions and official URLs)

Outputs
-------
static/smpte/data/{families,variants,keywords,facets,official,meta}.json
static/smpte/doc/<id>.json
static/smpte/pagefind/            (via Pagefind CLI)
"""
from __future__ import annotations

import argparse
import hashlib
import html as htmlmod
import json
import os
import re
import shutil
import subprocess
import sys
import time
import zipfile
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(os.environ.get("SMPTE_SOURCE", Path.home() / "Downloads" / "SMPTE standards document 202606"))
CACHE = ROOT / ".cache" / "smpte"
OFFICIAL = CACHE / "official"
TEXT_CACHE = CACHE / "text"
INDEX_SRC = CACHE / "pagefind-src"
DATA = ROOT / "static" / "smpte" / "data"
DOC = ROOT / "static" / "smpte" / "doc"
PF_OUT = ROOT / "static" / "smpte" / "pagefind"
TAXONOMY = ROOT / "scripts" / "smpte" / "taxonomy.json"
OVERRIDES = ROOT / "scripts" / "smpte" / "overrides.json"

FAMILY_RE = re.compile(r"^(st|rp|eg|rdd|ov)([0-9][0-9a-z.\-]*)$")
VERSION_RE = re.compile(r"^(\d{8})-(am(\d+)-)?pub$")
MAX_TEXT = 120_000
MAX_PAGES = 45
SNAPSHOT_DATE = time.strftime("%Y-%m-%d")
OVERRIDE_DATA: dict = {}

TYPO = {"ST": "ST", "RP": "RP", "EG": "EG", "RDD": "RDD", "OV": "OV"}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    print(msg, flush=True)


def sha1_file(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def clean_text(t: str) -> str:
    for a, b in (("\ufb01", "fi"), ("\ufb02", "fl"), ("\ufb00", "ff"), ("\ufb03", "ffi"), ("\ufb04", "ffl")):
        t = t.replace(a, b)
    t = t.replace("\u00ad", "").replace("\u00a0", " ")
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    t = re.sub(r"(?<=\w)-\n(?=\w)", "", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


class HTMLText(HTMLParser):
    BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6",
             "section", "article", "header", "footer", "table", "thead", "tbody",
             "td", "th", "pre", "blockquote", "figcaption"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0
        self.in_title = False
        self.title_parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg"):
            self.skip += 1
        if tag == "title":
            self.in_title = True
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self.skip:
            self.skip -= 1
        if tag == "title":
            self.in_title = False
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self.skip:
            return
        if self.in_title:
            self.title_parts.append(data)
        self.parts.append(data)

    def text(self) -> str:
        return clean_text("".join(self.parts))


def html_to_text(raw: bytes) -> str:
    parser = HTMLText()
    try:
        parser.feed(raw.decode("utf-8", errors="replace"))
    except Exception:
        return ""
    return parser.text()


# ---------------------------------------------------------------------------
# official snapshot
# ---------------------------------------------------------------------------

def parse_official_family(path: Path) -> dict | None:
    h = path.read_text(encoding="utf-8", errors="replace")
    m = re.search(r'<h1>Versions of (.*?)\s*<span id="state" class="state-([a-z]+)"', h, re.S)
    if not m:
        return None
    raw_title = htmlmod.unescape(norm_space(m.group(1)))
    state = m.group(2)
    fam = path.stem

    versions: list[dict] = []
    for chunk in h.split('<li class="version">')[1:]:
        chunk = chunk.split('<li class="version">')[0]
        bm = re.search(r'href="(\d{8}-(?:am\d+-)?pub/)">Publication \((\d{4}-\d{2}-\d{2})\)', chunk)
        if not bm:
            continue
        base = {"version": bm.group(1).rstrip("/"), "date": bm.group(2), "amends": None}
        versions.append(base)
        for ab in re.finditer(r'<ul class="amendments">(.*?)</ul>', chunk, re.S):
            for am in re.finditer(
                r'href="(\d{8}-(?:am\d+-)?pub/)">Publication \((\d{4}-\d{2}-\d{2})\)',
                ab.group(1),
            ):
                versions.append({
                    "version": am.group(1).rstrip("/"),
                    "date": am.group(2),
                    "amends": base["version"],
                })

    tm = re.match(r"^(ST|RP|EG|RDD|OV)\s+([0-9][0-9A-Za-z.\-]*)\s*,?\s*(.*)$", raw_title)
    if tm:
        dtype, number, title = tm.group(1), tm.group(2), tm.group(3).strip()
        title = re.sub(r"^[,\-–—]+\s*", "", title)
    else:
        dtype, number, title = fam[:2].upper(), fam, raw_title
        title = raw_title

    suite = re.search(r'<a href="/doc/(\d+)/">', h)
    return {
        "id": fam,
        "type": TYPO.get(dtype, dtype),
        "number": number,
        "designation": f"{TYPO.get(dtype, dtype)} {number}",
        "title": title or raw_title,
        "raw_title": raw_title,
        "state": state,
        "suite": suite.group(1) if suite else None,
        "withdrawal": bool(re.search(r'id="withdrawal-statement"', h)),
        "versions": versions,
        "family_url": f"https://pub.smpte.org/doc/{fam}/",
        "latest_url": f"https://pub.smpte.org/latest/{fam}/",
        "checked_at": SNAPSHOT_DATE,
    }


def load_official(limit: int | None = None, only: set[str] | None = None) -> dict[str, dict]:
    global SNAPSHOT_DATE
    snapshot_file = OFFICIAL / "_snapshot.json"
    if snapshot_file.exists():
        try:
            snap = json.loads(snapshot_file.read_text(encoding="utf-8"))
            crawled = str(snap.get("crawled_at", ""))[:10]
            if crawled:
                SNAPSHOT_DATE = crawled
        except Exception:
            pass
    files = sorted(OFFICIAL.glob("*.html"))
    if not files:
        raise SystemExit(f"no official snapshot in {OFFICIAL}; run with --refresh-official")
    out: dict[str, dict] = {}
    for p in files:
        rec = parse_official_family(p)
        if not rec:
            continue
        if only and rec["id"] not in only:
            continue
        out[rec["id"]] = rec
    if limit:
        out = dict(sorted(out.items())[:limit])
    log(f"official: {len(out)} families")
    return out


# ---------------------------------------------------------------------------
# local mirror inventory
# ---------------------------------------------------------------------------

def zip_members(path: Path) -> list[str]:
    try:
        with zipfile.ZipFile(path) as z:
            return z.namelist()
    except Exception:
        return []


def local_inventory(only: set[str] | None = None) -> dict:
    versions: dict[tuple[str, str], dict] = {}
    roots: dict[str, list[Path]] = {}
    families: list[str] = []
    if not SRC.is_dir():
        raise SystemExit(f"source not found: {SRC}")
    for fam_dir in sorted(SRC.iterdir()):
        if not fam_dir.is_dir():
            continue
        fam = fam_dir.name
        if not FAMILY_RE.match(fam):
            continue
        if only and fam not in only:
            continue
        families.append(fam)
        roots[fam] = [p for p in fam_dir.iterdir() if p.is_file() and p.suffix.lower() == ".pdf"]
        for vd in sorted(fam_dir.iterdir()):
            if not vd.is_dir() or not VERSION_RE.match(vd.name):
                continue
            pdfs = sorted(p for p in vd.iterdir() if p.is_file() and p.suffix.lower() == ".pdf")
            zips = sorted(p for p in vd.iterdir() if p.is_file() and p.suffix.lower() == ".zip")
            has_html = False
            zip_pdf = None
            for z in zips:
                members = zip_members(z)
                if any(m.lower().endswith("index.html") for m in members):
                    has_html = True
                if zip_pdf is None:
                    for m in members:
                        if m.lower().endswith(".pdf"):
                            zip_pdf = z
                            break
            primary = pdfs[0] if pdfs else (zips[0] if zips else None)
            fmt = "pdf" if pdfs else ("html" if has_html else ("zip-pdf" if zip_pdf else "none"))
            versions[(fam, vd.name)] = {
                "dir": vd,
                "pdfs": pdfs,
                "zips": zips,
                "has_html": has_html,
                "zip_pdf": zip_pdf,
                "primary": primary,
                "format": fmt,
            }
    log(f"local: {len(families)} families, {len(versions)} versions")
    return {"families": families, "versions": versions, "roots": roots}


# ---------------------------------------------------------------------------
# text extraction
# ---------------------------------------------------------------------------

def extract_from_pdf(path: Path) -> dict:
    import pymupdf as fitz

    doc = fitz.open(path)
    pages = doc.page_count
    texts = []
    for i in range(min(pages, MAX_PAGES)):
        try:
            texts.append(doc[i].get_text("text"))
        except Exception:
            texts.append("")
    try:
        outline = [{"level": lvl, "title": norm_space(t), "page": pg}
                   for lvl, t, pg in doc.get_toc(simple=True)[:60]]
    except Exception:
        outline = []
    text = clean_text("\n".join(texts))[:MAX_TEXT]
    return {
        "text": text,
        "pages": pages,
        "outline": outline,
        "scanned": bool(pages and len(text) / pages < 140),
    }


def extract_zip(path: Path) -> dict:
    import pymupdf as fitz

    text = ""
    pages = None
    outline: list[dict] = []
    with zipfile.ZipFile(path) as z:
        members = z.namelist()
        html_member = next((m for m in members if m.lower().endswith("index.html")), None)
        if html_member:
            text = html_to_text(z.read(html_member))
        pdf_member = next((m for m in members if m.lower().endswith(".pdf")), None)
        if pdf_member:
            try:
                doc = fitz.open(stream=z.read(pdf_member), filetype="pdf")
                pages = doc.page_count
                if not text:
                    text = clean_text("\n".join(doc[i].get_text("text")
                                                for i in range(min(pages, MAX_PAGES))))[:MAX_TEXT]
                try:
                    outline = [{"level": lvl, "title": norm_space(t), "page": pg}
                               for lvl, t, pg in doc.get_toc(simple=True)[:60]]
                except Exception:
                    pass
            except Exception:
                pass
    return {
        "text": text[:MAX_TEXT],
        "pages": pages,
        "outline": outline,
        "scanned": bool(pages and text and len(text) / pages < 140),
    }


def extract_version(info: dict) -> dict:
    primary: Path | None = info["primary"]
    if not primary:
        return {"text": "", "pages": None, "outline": [], "scanned": None}
    key = sha1_file(primary)
    cache_path = TEXT_CACHE / f"{key}.json"
    data = None
    if cache_path.exists():
        try:
            data = json.loads(cache_path.read_text())
        except Exception:
            data = None
    if data is None:
        try:
            if info["format"] == "pdf":
                data = extract_from_pdf(primary)
            else:
                data = extract_zip(primary)
        except Exception as exc:  # pragma: no cover - defensive
            data = {"text": "", "pages": None, "outline": [], "scanned": None, "error": str(exc)[:200]}
        data["sha1"] = key
        cache_path.write_text(json.dumps(data, ensure_ascii=False))

    # OCR fallback for image-only PDFs (cache handled inside ocr_pdf)
    if primary.suffix.lower() == ".pdf" and (not data.get("text") or data.get("scanned")):
        try:
            from ocr import ocr_pdf

            ocr = ocr_pdf(primary)
            if ocr.get("text"):
                data.update({
                    "text": ocr["text"],
                    "pages": ocr.get("pages") or data.get("pages"),
                    "scanned": False,
                    "ocr": True,
                    "ocr_dpi": ocr.get("ocr_dpi"),
                })
                cache_path.write_text(json.dumps(data, ensure_ascii=False))
                log(f"  OCR {primary.name}: {len(ocr['text'])} chars")
        except Exception as exc:  # pragma: no cover - defensive
            log(f"  OCR failed {primary.name}: {str(exc)[:160]}")
    return data


# ---------------------------------------------------------------------------
# enrichment
# ---------------------------------------------------------------------------

def scope_ok(body: str) -> bool:
    if len(body) < 40:
        return False
    low = body.lower()
    if low.startswith("table of contents") or "......" in body:
        return False
    if low.startswith(("normative references", "conformance notation", "foreword",
                       "introduction", "intellectual property", "page ")):
        return False
    if re.match(r"^smpte\s+(st|rp|eg|rdd|ov)\b", low):
        return False
    head = body[:240]
    digits = sum(1 for c in head if c.isdigit())
    if digits > 80:
        return False
    if head.count("  ") > 12:
        return False
    return True


def extract_scope(text: str) -> str:
    head = text[:90000]
    patterns = (
        r"(?im)^\s*1[\.\s]*scope\s*$",
        r"(?im)^\s*1\s+scope\b",
        r"(?im)^\s*scope\s*$",
    )
    for pat in patterns:
        for m in re.finditer(pat, head):
            seg = head[m.end():m.end() + 5000]
            n = re.search(r"(?m)^\s*\d+[\.\s]+[A-Z]", seg)
            body = seg[:n.start()] if n else seg[:1400]
            body = norm_space(body)
            body = re.sub(r"\bSMPTE\s+(?:ST|RP|EG|RDD|OV)\s+[0-9][0-9A-Za-z.\-]*:\d{4}\s+Page\s+\d+\s+of\s+\d+\s+pages?\b",
                          " ", body, flags=re.I)
            body = re.sub(r"\bPage\s+\d+\s+of\s+\d+\s+pages?\b", " ", body, flags=re.I)
            body = norm_space(body)
            body = re.sub(r"^[^0-9A-Za-z\u4e00-\u9fff]+", "", body)
            body = re.sub(r"^For the purposes of[^.]*\.\s*", "", body, flags=re.I)
            if scope_ok(body) and len(body) < 4000:
                return body[:1500]
    m = re.search(r"(?i)\bScope\b", text[:60000])
    if m:
        seg = norm_space(text[m.end():m.end() + 700])
        if scope_ok(seg):
            return seg[:700]
    # OV documents often use "Document Roadmap" instead of a Scope clause.
    m = re.search(r"(?im)^\s*(Document Roadmap|Roadmap)\s*$", head)
    if m:
        seg = norm_space(head[m.end():m.end() + 1500])
        if scope_ok(seg):
            return seg[:1200]
    # last resort: first substantial paragraph that is not a cover/ToC block
    for para in re.split(r"\n\s*\n", head[:8000]):
        body = norm_space(para)
        low = body.lower()
        if len(body) < 100 or not scope_ok(body):
            continue
        if low.startswith(("copyright", "approved", "page ", "table of contents", "foreword")):
            continue
        if "....." in body:
            continue
        return body[:900]
    return ""


def extract_definitions(text: str) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    rx = re.compile(r"(?m)^\s*(\d+(?:\.\d+){1,2})\s+([A-Z][^\n]{2,70})\s*\n\s*([^\n]{15,400})")
    for m in rx.finditer(text[:50000]):
        term = norm_space(m.group(2)).strip(" .")
        definition = norm_space(m.group(3))
        low = term.lower()
        if low in seen or len(term) < 2 or " page " in low or low.startswith("table"):
            continue
        if re.search(r"\b(SMPTE|ST|RP|EG|RDD|ANSI|Annex|Table|Figure)\b", term):
            continue
        if not definition[:1].islower():
            continue
        words = term.split()
        if len(words) > 5 or re.search(r"[,.;:()]", term):
            continue
        low_words = {w.lower().strip("-") for w in words}
        if low_words & {"the", "this", "these", "those", "in", "for", "as", "an", "a",
                        "it", "its", "if", "when", "where", "shall", "is", "are", "be",
                        "was", "were", "has", "have", "can", "may", "will", "would",
                        "should", "must", "and", "or", "of", "to", "with", "from", "by",
                        "on", "at", "that", "which"}:
            continue
        if words[0].lower() in {"the", "this", "these", "those", "in", "for", "as", "an", "a"}:
            continue
        seen.add(low)
        out.append({"term": term, "definition": definition[:300]})
        if len(out) >= 12:
            break
    return out


def extract_refs(text: str, known: set[str]) -> list[str]:
    out: list[str] = []
    for m in re.finditer(r"\bSMPTE\s+(ST|RP|EG|RDD)\s*(\d+(?:[.\-]\d+)*)", text[:50000], re.I):
        num = m.group(2).replace(".", "-")
        num = "-".join(str(int(p)) if p.isdigit() else p for p in num.split("-"))
        fid = m.group(1).lower() + num
        if fid in known and fid not in out:
            out.append(fid)
        if len(out) >= 30:
            break
    return out


def load_taxonomy() -> dict:
    return json.loads(TAXONOMY.read_text(encoding="utf-8"))


def load_overrides() -> dict:
    if not OVERRIDES.exists():
        return {}
    try:
        return json.loads(OVERRIDES.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - defensive
        log(f"overrides ignored: {exc}")
        return {}


def label_ok(k: dict) -> bool:
    label = (k.get("abbr") or k.get("term") or "").strip()
    if k.get("source") == "curated":
        return True
    if k.get("source") == "acronym":
        return len(label) >= 3 and label.isalpha()
    if k.get("source") == "definition":
        return len(label) >= 4 and not label.isupper()
    return False


def word_norm(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^0-9a-z\u4e00-\u9fff]+", " ", s)
    return " " + re.sub(r"\s+", " ", s).strip() + " "


def term_count(hay_norm: str, alias: str) -> int:
    a = word_norm(alias).strip()
    if not a:
        return 0
    return hay_norm.count(" " + a + " ")


def build_keywords(families: dict[str, dict], texts: dict[str, str]) -> list[dict]:
    tax = load_taxonomy()
    entries: dict[str, dict] = {}
    postings: dict[str, dict[str, int]] = defaultdict(dict)

    def entry(key: str, **kw) -> dict:
        if key not in entries:
            entries[key] = {
                "term": kw.get("term", key),
                "zh": kw.get("zh", ""),
                "abbr": kw.get("abbr", ""),
                "aliases": kw.get("aliases", []),
                "category": kw.get("category", "other"),
                "source": kw.get("source", "curated"),
                "definition": kw.get("definition", ""),
                "docs": [],
                "count": 0,
            }
        return entries[key]

    for t in tax["terms"]:
        key = (t.get("abbr") or t["term"]).strip().lower()
        e = entry(key, term=t["term"], zh=t.get("zh", ""), abbr=t.get("abbr", ""),
                  aliases=t.get("aliases", []), category=t.get("category", "other"),
                  source="curated", definition=t.get("definition", ""))
        for a in [t["term"], t.get("abbr", ""), t.get("zh", ""), *t.get("aliases", [])]:
            if a and a not in e["aliases"]:
                e["aliases"].append(a)

    acr_map: dict[str, dict[str, int]] = defaultdict(dict)
    definitions: dict[str, dict] = {}
    STOP = {
        "THE", "AND", "FOR", "WITH", "THIS", "THAT", "FROM", "ARE", "NOT", "SHALL", "PAGE",
        "SMPTE", "IEEE", "ISO", "IEC", "ITU", "NOTE", "TABLE", "FIGURE", "ANNEX", "HTTP",
        "HTTPS", "PDF", "HTML", "XML", "API", "URL", "FIG", "CLAUSE", "SECTION", "PART",
        "USA", "INC", "LLC", "ALL", "ANY", "MAY", "MUST", "CAN", "USE", "USED", "ONLY",
        "ANSI", "DCI", "ATSC", "FCC", "EBU", "NAB", "ST", "RP", "EG", "RDD", "OV",
        "ISO", "IEC", "ITU", "TV", "HD", "SD", "UHD", "AES", "EBU", "SMPTE", "DOI",
        "ISBN", "ISSN", "URL", "URI", "API", "SDK", "PDF", "HTML", "XML", "HTTP",
        "ID", "OK", "NO", "ON", "OFF", "UP", "DOWN", "LEFT", "RIGHT", "NEW", "OLD",
        "TR", "NA", "N/A", "ETC", "EG", "IE", "CF", "VS", "GROUP", "DATA", "S1", "R1",
        "RFC", "IETF", "LSB", "MSB", "III", "EIA", "TIA",
    }

    for fid, fam in families.items():
        text = texts.get(fid, "")
        title = fam["title"]
        scope = fam["scope"]
        body = text[:25000]
        title_n, scope_n, body_n = word_norm(title), word_norm(scope), word_norm(body)

        scored: list[tuple[int, str]] = []
        for key, e in entries.items():
            if e["source"] != "curated":
                continue
            score = 0
            for alias in e["aliases"]:
                a = alias.lower()
                if len(a) < 2:
                    continue
                score += 8 * term_count(title_n, a)
                score += 4 * term_count(scope_n, a)
                score += term_count(body_n, a)
            if score > 0:
                postings[key][fid] = score
                scored.append((score, key))
        scored.sort(reverse=True)
        fam["_keyword_keys"] = [k for _, k in scored[:8]]
        cats = Counter()
        for score, key in scored[:8]:
            if score >= 4:
                cats[entries[key]["category"]] += score
        fam["categories"] = [c for c, _ in cats.most_common(2) if c != "other"] or ["other"]

        for acr, cnt in Counter(re.findall(r"\b[A-Z][A-Z0-9]{1,5}\b", text[:30000])).items():
            if acr in STOP or cnt < 3:
                continue
            if len(acr) <= 3 and any(ch.isdigit() for ch in acr):
                continue
            acr_map[acr][fid] = cnt
        for d in fam.get("definitions", [])[:8]:
            term = d["term"]
            if 2 <= len(term) <= 60:
                definitions.setdefault(term.lower(), {"term": term, "docs": []})["docs"].append(fid)

    top_acr = sorted(acr_map.items(), key=lambda kv: -len(kv[1]))[:200]
    for acr, docs in top_acr:
        key = acr.lower()
        entry(key, term=acr, abbr=acr, aliases=[acr], source="acronym")
        for fid, cnt in docs.items():
            postings[key][fid] = postings[key].get(fid, 0) + 2 * int(cnt)

    existing_terms = set()
    for e in entries.values():
        existing_terms.add(e["term"].lower())
        if e.get("abbr"):
            existing_terms.add(e["abbr"].lower())
    for low, d in definitions.items():
        if d["term"].lower() in existing_terms:
            continue
        key = ("def:" + low)[:80]
        e = entry(key, term=d["term"], aliases=[d["term"]], source="definition")
        for fid in d["docs"][:30]:
            postings[key][fid] = postings[key].get(fid, 0) + 3

    out: list[dict] = []
    for key, e in entries.items():
        docs = sorted(postings.get(key, {}).items(), key=lambda kv: (-kv[1], kv[0]))
        if not docs:
            continue
        e["docs"] = [d for d, _ in docs[:50]]
        e["count"] = len(docs)
        if label_ok(e):
            out.append(e)

    out.sort(key=lambda e: (-e["count"], e["term"]))

    # Manual per-document keywords (overrides.json): attach to existing entries
    # so the doc list and the detail drawer stay consistent with the catalog.
    for fid, labels in (OVERRIDE_DATA.get("keywords") or {}).items():
        if fid not in families:
            continue
        for label in labels:
            e = next((x for x in out if x["term"] == label or x.get("abbr") == label), None)
            if not e:
                continue
            if fid in e["docs"]:
                continue
            e["docs"].insert(0, fid)
            e["count"] += 1

    log(f"keywords: {len(out)} entries")
    return out


# ---------------------------------------------------------------------------
# emit
# ---------------------------------------------------------------------------

def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def build(args) -> None:
    t0 = time.time()
    only = set(args.only.split(",")) if args.only else None
    official = load_official(args.limit, only)
    inv = local_inventory(only)
    global OVERRIDE_DATA
    OVERRIDE_DATA = load_overrides()
    known = set(official)

    # extract local texts
    texts: dict[str, str] = {}
    variants: list[dict] = []
    fam_state: dict[str, dict] = {}
    total = len(official)
    done = 0
    for fid, fam in official.items():
        fam_text = ""
        latest_extract = None
        ocr_any = False
        missing: list[str] = []
        local_count = 0
        for v in fam["versions"]:
            key = (fid, v["version"])
            info = inv["versions"].get(key)
            present = info is not None and info.get("primary") is not None
            ex = {}
            v["kind"] = "amendment" if "-am" in v["version"] else "publication"
            v["official_url"] = f"https://pub.smpte.org/doc/{fid}/{v['version']}/"
            v["present_locally"] = present
            v["local_file"] = str(info["primary"].relative_to(SRC)) if present and info["primary"] else None
            if present:
                local_count += 1
                ex = extract_version(info)
                if ex.get("ocr"):
                    ocr_any = True
                if not fam_text and ex.get("text"):
                    fam_text = ex["text"]
                if latest_extract is None:
                    latest_extract = ex
            else:
                missing.append(v["version"])
            variants.append({
                "family": fid,
                "version": v["version"],
                "date": v["date"],
                "kind": "amendment" if "-am" in v["version"] else "publication",
                "amends": v.get("amends"),
                "official_url": v["official_url"],
                "official_state": fam["state"],
                "present_locally": present,
                "local_file": v["local_file"],
                "format": info["format"] if present else None,
                "pages": ex.get("pages"),
                "chars": len(ex.get("text", "")),
                "scanned": ex.get("scanned"),
                "ocr": bool(ex.get("ocr")),
            })
        fam["local_versions"] = local_count
        fam["missing_locally"] = missing
        fam["newer_official"] = bool(missing)
        fam["has_text"] = bool(fam_text)
        fam["scope"] = (OVERRIDE_DATA.get("scope", {}).get(fid)
                        or extract_scope(fam_text))
        fam["scope_short"] = fam["scope"][:240]
        fam["definitions"] = extract_definitions(fam_text)
        fam["pages"] = latest_extract.get("pages") if latest_extract else None
        fam["scanned"] = latest_extract.get("scanned") if latest_extract else None
        fam["ocr"] = ocr_any
        fam["outline"] = latest_extract.get("outline", []) if latest_extract else []
        fam["categories"] = []
        fam["keywords"] = []
        fam["_keyword_keys"] = []
        texts[fid] = fam_text
        fam_state[fid] = fam
        done += 1
        if done % 50 == 0:
            log(f"  extracted {done}/{total} families  ({time.time()-t0:.0f}s)")

    # references graph
    for fid, fam in fam_state.items():
        fam["refs"] = [r for r in extract_refs(texts.get(fid, ""), known) if r != fid]
    cited: dict[str, list[str]] = defaultdict(list)
    for fid, fam in fam_state.items():
        for r in fam["refs"]:
            cited[r].append(fid)
    for fid, fam in fam_state.items():
        fam["cited_by"] = sorted(cited.get(fid, []))

    # keywords
    keywords = build_keywords(fam_state, texts)
    kw_cat = {(k.get("abbr") or k["term"]): k["category"] for k in keywords}
    kw_by_doc: dict[str, list[dict]] = defaultdict(list)
    for k in keywords:
        for doc_id in k["docs"]:
            kw_by_doc[doc_id].append(k)
    for fid, fam in fam_state.items():
        names: list[str] = []
        for key in fam.get("_keyword_keys", []):
            for k in keywords:
                if (k.get("abbr") or k["term"]).strip().lower() == key:
                    label = k["abbr"] or k["term"]
                    if label not in names:
                        names.append(label)
                    break
        if len(names) < 6:
            for k in sorted(kw_by_doc.get(fid, []),
                            key=lambda k: (k["source"] != "curated", -k["count"], k["term"])):
                if not label_ok(k):
                    continue
                label = k["abbr"] or k["term"]
                if label and label not in names:
                    names.append(label)
                if len(names) >= 6:
                    break
        for label in reversed(OVERRIDE_DATA.get("keywords", {}).get(fid, [])):
            if label not in names:
                names.insert(0, label)
        fam["keywords"] = names[:8]
        if fam["categories"] == ["other"]:
            cat = Counter(kw_cat[n] for n in names
                          if kw_cat.get(n) and kw_cat[n] != "other")
            if cat:
                fam["categories"] = [c for c, _ in cat.most_common(2)]

    # families / doc / facets
    families_out = []
    for fid, fam in fam_state.items():
        latest = max((v["date"] for v in fam["versions"]), default="")
        latest_v = max(fam["versions"], key=lambda x: x["date"], default=None)
        families_out.append({
            "id": fid,
            "type": fam["type"],
            "number": fam["number"],
            "designation": fam["designation"],
            "title": fam["title"],
            "state": fam["state"],
            "suite": fam["suite"],
            "official": {
                "family_url": fam["family_url"],
                "latest_url": fam["latest_url"],
                "checked_at": SNAPSHOT_DATE,
            },
            "versions_official": len(fam["versions"]),
            "versions_local": fam["local_versions"],
            "has_text": fam["has_text"],
            "missing_locally": fam["missing_locally"],
            "newer_official": fam["newer_official"],
            "latest_date": latest,
            "latest_version": latest_v["version"] if latest_v else None,
            "latest_official_url": latest_v["official_url"] if latest_v else fam["family_url"],
            "categories": fam["categories"],
            "keywords": fam["keywords"],
            "scope_short": fam["scope_short"],
            "pages": fam["pages"],
            "scanned": fam["scanned"],
            "ocr": fam.get("ocr", False),
            "refs_out": len(fam["refs"]),
            "cited_by": len(fam["cited_by"]),
        })
        doc_kws = [k for k in keywords if fid in k["docs"] and label_ok(k)]
        doc_kws.sort(key=lambda k: (k["source"] != "curated", -k["count"], k["term"]))
        write_json(DOC / f"{fid}.json", {
            "id": fid,
            "designation": fam["designation"],
            "title": fam["title"],
            "state": fam["state"],
            "suite": fam["suite"],
            "official": {
                "family_url": fam["family_url"],
                "latest_url": fam["latest_url"],
                "checked_at": SNAPSHOT_DATE,
            },
            "scope": fam["scope"],
            "outline": fam["outline"],
            "definitions": fam["definitions"],
            "keywords": [
                {"term": k["term"], "zh": k["zh"], "abbr": k["abbr"],
                 "category": k["category"], "source": k["source"]}
                for k in doc_kws[:12]
            ],
            "refs": [{"id": r, "designation": fam_state[r]["designation"]} for r in fam["refs"] if r in fam_state],
            "cited_by": [{"id": r, "designation": fam_state[r]["designation"]} for r in fam["cited_by"] if r in fam_state],
            "versions": [
                {"version": v["version"], "date": v["date"],
                 "kind": v.get("kind") or ("amendment" if "-am" in v["version"] else "publication"),
                 "official_url": v["official_url"], "present_locally": v["present_locally"]}
                for v in sorted(fam["versions"], key=lambda x: x["date"], reverse=True)
            ],
            "pages": fam["pages"],
            "scanned": fam["scanned"],
            "ocr": fam.get("ocr", False),
        })

    families_out.sort(key=lambda f: f["id"])
    variants.sort(key=lambda v: (v["family"], v["date"]))
    write_json(DATA / "families.json", families_out)
    write_json(DATA / "variants.json", variants)
    write_json(DATA / "keywords.json", keywords)

    # facets
    def count(key):
        c = Counter()
        for f in families_out:
            c[f[key] or "—"] += 1
        return dict(sorted(c.items(), key=lambda kv: (-kv[1], kv[0])))

    decades = Counter()
    for f in families_out:
        decades[(int(f["latest_date"][:4]) // 10) * 10 if f["latest_date"] else "—"] += 1
    facets = {
        "type": count("type"),
        "state": count("state"),
        "suite": dict(sorted(Counter(f["suite"] for f in families_out if f["suite"]).items())),
        "decade": {str(k): v for k, v in sorted(decades.items(), key=lambda kv: str(kv[0]))},
        "category": dict(Counter(c for f in families_out for c in f["categories"]).most_common()),
    }
    write_json(DATA / "facets.json", facets)

    meta = {
        "built_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "snapshot_date": SNAPSHOT_DATE,
        "families": len(families_out),
        "versions": len(variants),
        "local_versions": sum(1 for v in variants if v["present_locally"]),
        "keywords": len(keywords),
        "scanned": sum(1 for f in families_out if f["scanned"]),
        "ocr": sum(1 for v in variants if v.get("ocr")),
        "html_packages": sum(1 for v in variants if v.get("format") == "html"),
        "types": facets["type"],
        "states": facets["state"],
    }
    write_json(DATA / "meta.json", meta)

    # official snapshot (compact, for transparency / link generation)
    official_out = {
        fid: {
            "designation": fam["designation"],
            "title": fam["title"],
            "state": fam["state"],
            "suite": fam["suite"],
            "family_url": fam["family_url"],
            "versions": [{"version": v["version"], "date": v["date"], "amends": v.get("amends")}
                         for v in fam["versions"]],
        }
        for fid, fam in fam_state.items()
    }
    write_json(DATA / "official.json", official_out)
    log(f"data written: {len(families_out)} families / {len(variants)} versions / {len(keywords)} keywords")

    if not args.skip_pagefind:
        build_pagefind(fam_state, variants)
    log(f"done in {time.time()-t0:.0f}s")


def render_pagefind_pages(records: list[dict]) -> None:
    """只把元数据写进 Pagefind：标题、编号、Scope、关键词；不写标准正文。"""
    if INDEX_SRC.exists():
        shutil.rmtree(INDEX_SRC)
    INDEX_SRC.mkdir(parents=True, exist_ok=True)
    for r in records:
        title = f"{r['designation']}:{r['date'][:4]} — {r['title']}"
        scope = (r.get("scope") or "").strip()
        kws = r.get("keywords") or []
        kw = ", ".join(kws) if isinstance(kws, list) else str(kws)
        suite = r.get("suite")
        page = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>{htmlmod.escape(title)}</title></head>
<body data-pagefind-body>
<h1 data-pagefind-meta="title">{htmlmod.escape(title)}</h1>
<div data-pagefind-meta="id:{r['family']}"></div>
<div data-pagefind-meta="designation:{htmlmod.escape(r['designation'])}"></div>
<div data-pagefind-meta="date:{r['date']}"></div>
<div data-pagefind-meta="state:{r['state']}"></div>
<div data-pagefind-filter="type[data-type]" data-type="{r['type']}"></div>
<div data-pagefind-filter="state[data-state]" data-state="{r['state']}"></div>
<div data-pagefind-filter="year[data-year]" data-year="{r['date'][:4]}"></div>
{f'<div data-pagefind-filter="suite[data-suite]" data-suite="{suite}"></div>' if suite else ''}
<article>
<p>{htmlmod.escape(scope)}</p>
{f'<p>Keywords: {htmlmod.escape(kw)}</p>' if kw else ''}
</article>
</body></html>"""
        out = INDEX_SRC / r["family"] / r["version"] / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page, encoding="utf-8")
    log(f"pagefind source pages: {len(records)}（仅元数据）")
    if PF_OUT.exists():
        shutil.rmtree(PF_OUT)
    PF_OUT.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["npm_config_cache"] = str(ROOT / ".tmp" / "npm-cache")
    cmd = [
        "npx", "--yes", "pagefind",
        "--site", str(INDEX_SRC),
        "--output-path", str(PF_OUT),
        "--force-language", "en",
        "--include-characters=-:./",
        "--max-fragments", "40",
    ]
    log("running pagefind…")
    subprocess.run(cmd, cwd=str(ROOT), env=env, check=True)


def build_pagefind(fam_state: dict[str, dict], variants: list[dict]) -> None:
    records = []
    for v in variants:
        if not v["present_locally"]:
            continue
        fam = fam_state[v["family"]]
        records.append({
            "family": v["family"], "version": v["version"], "date": v["date"],
            "designation": fam["designation"], "title": fam["title"],
            "state": fam["state"], "type": fam["type"], "suite": fam.get("suite"),
            "scope": fam.get("scope_short") or fam.get("scope") or "",
            "keywords": fam.get("keywords") or [],
        })
    render_pagefind_pages(records)


def pagefind_only() -> None:
    fams = {f["id"]: f for f in json.loads((DATA / "families.json").read_text(encoding="utf-8"))}
    variants = json.loads((DATA / "variants.json").read_text(encoding="utf-8"))
    records = []
    for v in variants:
        if not v.get("present_locally"):
            continue
        fam = fams.get(v["family"])
        if not fam:
            continue
        records.append({
            "family": v["family"], "version": v["version"], "date": v["date"],
            "designation": fam["designation"], "title": fam["title"],
            "state": fam["state"], "type": fam["type"], "suite": fam.get("suite"),
            "scope": fam.get("scope_short") or fam.get("scope") or "",
            "keywords": fam.get("keywords") or [],
        })
    render_pagefind_pages(records)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--only", default=None)
    ap.add_argument("--skip-pagefind", action="store_true")
    ap.add_argument("--source", default=None)
    ap.add_argument("--pagefind-only", action="store_true", help="只重建元数据索引，不重新抽取")
    args = ap.parse_args()
    global SRC
    if args.source:
        SRC = Path(args.source)
    for d in (CACHE, DATA, DOC):
        d.mkdir(parents=True, exist_ok=True)
    if args.pagefind_only:
        pagefind_only()
        return
    build(args)


if __name__ == "__main__":
    main()
