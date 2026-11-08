#!/usr/bin/env python3
"""Compare only archived public image bytes with current public image bytes.

- READ ONLY: streams tar entries; no tar extraction or source edits.
- Does not touch database, Cloudinary, payment data or private archives.
- Produces private report that identifies historical images absent from live files.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import tarfile
import time
from collections import Counter, defaultdict
from pathlib import Path

ARCHIVE = Path("/root/deploy-backups/minberiaksa-20261008-233604.tar.gz")
APP = Path.cwd()
OUT = Path("/root/minber-media-recovery/from-drive/server-source-discovery/october-public-media-diff.json")
IMAGE = re.compile(r"\.(jpe?g|png|webp|avif|gif|heic|heif|bmp|tiff?)$", re.I)
MAX_FILES = 25000
MAX_MEMBER_BYTES = 40 * 1024 * 1024
MAX_SECONDS = 180


def sha256_stream(handle):
    dig = hashlib.sha256()
    while True:
        b = handle.read(1024 * 1024)
        if not b:
            break
        dig.update(b)
    return dig.hexdigest()


def valid_project_path(name):
    # Keep archive names literal: lstrip("./") could turn ../private paths into
    # misleading public paths. Nothing here is ever extracted to disk.
    normalized = name.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    if normalized.startswith("/"):
        return None
    parts = normalized.split("/")
    if parts and parts[0] == "minberiaksa":
        parts.pop(0)
    if not parts or any(p in ("", ".", "..") for p in parts):
        return None
    # Also include root-level public images (e.g. public/hero.jpg). The
    # initial audit required 3 path components, silently skipping these.
    public_image = parts[0] == "public" and len(parts) >= 2
    handoff_image = parts[:2] == ["handoff-certificates", "assets"] and len(parts) >= 3
    if not (public_image or handoff_image):
        return None
    normalized = "/".join(parts)
    if not IMAGE.search(normalized):
        return None
    return normalized


def live_files():
    files = {}
    by_checksum = defaultdict(list)
    count_skipped = 0
    for folder in ("public", "handoff-certificates/assets"):
        root = APP / folder
        if not root.is_dir():
            continue
        for base, dirs, names in os.walk(root, followlinks=False):
            dirs[:] = [d for d in dirs if not (Path(base) / d).is_symlink()]
            for name in names:
                p = Path(base) / name
                if not IMAGE.search(name):
                    continue
                try:
                    st = p.lstat()
                    if not stat.S_ISREG(st.st_mode) or not (0 < st.st_size <= MAX_MEMBER_BYTES):
                        count_skipped += 1
                        continue
                    real = p.resolve(strict=True)
                    if os.path.commonpath((str(real), str(APP.resolve()))) != str(APP.resolve()):
                        count_skipped += 1
                        continue
                    with real.open("rb") as handle:
                        digest = sha256_stream(handle)
                    rel = p.relative_to(APP).as_posix()
                    files[rel] = {"path": rel, "bytes": st.st_size, "sha256": digest}
                    by_checksum[digest].append(rel)
                except (OSError, ValueError):
                    count_skipped += 1
    return files, by_checksum, count_skipped


def run():
    if (not (APP / "lib/minbar/content/media.ts").is_file()
        or not (APP / "package.json").is_file()):
        raise RuntimeError("RUN_FROM_PROJECT_ROOT: cd /root/minberiaksa")
    if not ARCHIVE.is_file() or ARCHIVE.is_symlink():
        raise RuntimeError("ARCHIVE_MISSING_OR_LINK")
    started = time.monotonic()
    current, hashes, skipped = live_files()
    items = []
    counts = Counter()
    with tarfile.open(ARCHIVE, "r|gz") as archive:
        for index, entry in enumerate(archive):
            if index >= MAX_FILES or time.monotonic() - started > MAX_SECONDS:
                counts["TRUNCATED"] += 1
                break
            if not entry.isfile() or entry.issym() or entry.islnk():
                continue
            image_named = bool(IMAGE.search(entry.name))
            if image_named:
                counts["ARCHIVE_IMAGE_ENTRIES_SEEN"] += 1
            rel = valid_project_path(entry.name)
            if not rel:
                if image_named:
                    counts["IMAGE_ENTRIES_OUTSIDE_SUPPORTED_PUBLIC_PATHS"] += 1
                continue
            if entry.size < 1 or entry.size > MAX_MEMBER_BYTES:
                counts["SKIPPED_SIZE"] += 1
                continue
            f = archive.extractfile(entry)
            if f is None:
                continue
            with f:
                digest = sha256_stream(f)
            same_path = current.get(rel)
            other_paths = hashes.get(digest, [])
            if same_path and same_path["sha256"] == digest:
                status = "IDENTICAL_TO_LIVE"
            elif same_path:
                status = "CHANGED_FROM_LIVE"
            elif other_paths:
                status = "MISSING_PATH_BUT_CONTENT_PRESENT_ELSEWHERE"
            else:
                status = "ARCHIVE_ONLY_CONTENT"
            counts[status] += 1
            items.append({
                "archive_path": rel,
                "bytes": entry.size,
                "sha256": digest,
                "status": status,
                "current_same_path": same_path,
                "identical_live_paths": other_paths[:10],
                "needs_editorial_photo_review": status != "IDENTICAL_TO_LIVE",
            })
    changed = [x for x in items if x["status"] != "IDENTICAL_TO_LIVE"]
    counts["TOTAL_ARCHIVED_IMAGES_COMPARED"] = len(items)
    counts["LIVE_IMAGES_HASHED"] = len(current)
    counts["LIVE_IMAGES_SKIPPED"] = skipped
    summary = dict(counts)
    output = {
        "mode": "READ_ONLY_ARCHIVE_HASH_DIFF",
        "archive": str(ARCHIVE),
        "summary": summary,
        "possible_historical_assets": changed,
        "no_source_files_extracted": True,
        "database_changed": False,
        "cloudinary_uploads": 0,
        "warnings": [
            "Archived files may be logos, website decoration or unrelated photos.",
            "An archive-only file is not proof of a photo belonging to a specific project.",
            "Review any unique images before uploading or changing campaign records.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(OUT, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print("ARCHIVE_PUBLIC_IMAGE_DIFF:", json.dumps(summary, ensure_ascii=False))
    for x in changed[:35]:
        print("CHANGED_OR_MISSING:", x["status"], x["archive_path"], "BYTES:", x["bytes"])
    print("REPORT:", str(OUT))
    print("EXTRACTED_FILES: 0")
    print("DATABASE_CHANGED: NO")
    print("CLOUDINARY_UPLOADS: NONE")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print("ARCHIVE_PUBLIC_DIFF_FAILED:", str(exc)[:200])
        raise SystemExit(1)
