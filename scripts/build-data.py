#!/usr/bin/env python3
"""Scan works/ and generate js/data.js for the portfolio site.

- Each work folder (works/<Category>/<NN-name>/) becomes one entry.
- Metadata is parsed from info.md (title, year, medium, size, 簡介, 完整敘述).
- HEIC images are converted to JPG into generated/ via macOS `sips`.
- Works without any image are skipped (reported on stdout).

Re-run this script whenever the works/ folder changes:
    python3 scripts/build-data.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKS = ROOT / "works"
GENERATED = ROOT / "generated"
OUT = ROOT / "js" / "data.js"

IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
HEIC_EXTS = {".heic"}

CATEGORY_ORDER = ["Design", "Illustration", "Oilpainting", "Photograph", "Project"]
CATEGORY_LABELS = {
    "Design": "GRAPHIC DESIGN",
    "Illustration": "ILLUSTRATION",
    "Oilpainting": "OIL PAINTING",
    "Photograph": "PHOTOGRAPHY",
    "Project": "PROJECT",
}

PLACEHOLDER_PATTERNS = ["一兩句話", "創作理念、脈絡、過程等較長文字"]


def parse_info(path: Path) -> dict:
    info = {"title": "", "desc": "", "longDesc": "", "meta": {}}
    if not path.exists():
        return info
    text = path.read_text(encoding="utf-8")
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    m = re.search(r"^#\s+(.+)$", text, re.M)
    if m:
        info["title"] = m.group(1).strip()

    for m in re.finditer(r"^-[ \t]*([A-Za-z]+)[ \t]*:[ \t]*(.*)$", text, re.M):
        key, val = m.group(1).lower(), m.group(2).strip()
        if val:
            info["meta"][key] = val

    def section(name: str) -> str:
        m = re.search(rf"^##\s*{name}\s*$(.*?)(?=^##\s|\Z)", text, re.M | re.S)
        if not m:
            return ""
        body = m.group(1).strip()
        body = re.sub(r"[ \t　]+", " ", body)
        if any(p in body for p in PLACEHOLDER_PATTERNS):
            return ""
        return body

    info["desc"] = section("簡介")
    info["longDesc"] = section("完整敘述")
    return info


def convert_heic(src: Path):
    rel = src.relative_to(WORKS)
    dest = GENERATED / rel.with_suffix(".jpg")
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_mtime >= src.stat().st_mtime:
        return dest
    r = subprocess.run(
        ["sips", "-s", "format", "jpeg", "-Z", "2200", str(src), "--out", str(dest)],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print(f"  !! HEIC 轉檔失敗: {rel} — {r.stderr.strip()}", file=sys.stderr)
        return None
    return dest


def collect_images(folder: Path):
    imgs = []
    for f in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
        if not f.is_file() or f.name.startswith("."):
            continue
        ext = f.suffix.lower()
        if ext in IMG_EXTS:
            imgs.append(str(f.relative_to(ROOT)))
        elif ext in HEIC_EXTS:
            dest = convert_heic(f)
            if dest:
                imgs.append(str(dest.relative_to(ROOT)))
    # cover.* 或 0 開頭的檔案優先
    imgs.sort(key=lambda p: (0 if Path(p).stem.lower().startswith(("cover", "0")) else 1, p.lower()))
    return imgs


def clean_title(raw: str, folder_name: str) -> str:
    title = raw or folder_name
    title = re.sub(r"^\d+[-_]\s*", "", title).strip()
    return title or folder_name


def main() -> None:
    works = []
    skipped = []
    categories = [d for d in CATEGORY_ORDER if (WORKS / d).is_dir()]

    for cat in categories:
        cat_dir = WORKS / cat
        for folder in sorted(cat_dir.iterdir(), key=lambda p: p.name):
            if not folder.is_dir():
                continue
            info = parse_info(folder / "info.md")
            images = collect_images(folder)
            if not images:
                skipped.append(str(folder.relative_to(ROOT)))
                continue
            works.append({
                "slug": folder.name,
                "category": cat,
                "categoryLabel": CATEGORY_LABELS.get(cat, cat.upper()),
                "title": clean_title(info["title"], re.sub(r"^\d+-", "", folder.name)),
                "desc": info["desc"],
                "longDesc": info["longDesc"],
                "year": info["meta"].get("year", ""),
                "medium": info["meta"].get("medium", ""),
                "size": info["meta"].get("size", ""),
                "images": images,
                "cover": images[0],
            })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(works, ensure_ascii=False, indent=2)
    OUT.write_text(f"window.WORKS = {payload};\n", encoding="utf-8")

    print(f"共 {len(works)} 件作品寫入 {OUT.relative_to(ROOT)}")
    for s in skipped:
        print(f"  略過（無圖片）: {s}")


if __name__ == "__main__":
    main()
