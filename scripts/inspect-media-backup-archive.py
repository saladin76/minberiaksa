#!/usr/bin/env python3
"""Read-only inventory of media entries inside a single known Minber backup.
No extraction, no filesystem writes outside a private JSON report.
"""
import collections
import json
import os
import re
import tarfile
import time
from pathlib import Path

SOURCE = Path("/root/deploy-backups/minberiaksa-20261008-233604.tar.gz")
OUTPUT = Path("/root/minber-media-recovery/from-drive/server-source-discovery/archived-media-inventory.json")
MAX_ENTRIES = 200_000
MAX_SECONDS = 180
MAX_CANDIDATES_REPORTED = 1200
MAX_BYTES_SINGLE = 80 * 1024 * 1024
IMAGE = re.compile(r"\.(jpg|jpeg|png|webp|avif|gif|heic|tif|tiff|bmp)$", re.I)
ARCHIVE = re.compile(r"\.(zip|tar|tar\.gz|tgz|tar\.xz|7z|rar)$", re.I)
SENSITIVE = re.compile(
    r"(^|/)(donor(s)?|payment(s)?|bank.transfer(s)?|kyc|"
    r"passport(s)?|identity|invoice(s)?|receipt(s)?|private|"
    r"secret(s)?|certificate(s)?|node_modules|\.git)(/|$)", re.I
)
PUBLIC_MEDIA = re.compile(
    r"(^|/)(public|uploads?|media|photos?|images?|gallery|assets)(/|$)", re.I
)
CACHE = re.compile(r"(^|/)(\.next|\.next-previous)/cache/images/", re.I)
EXCLUDE_GENERIC = re.compile(
    r"(^|/)(?:samples|blog-cover|fonts|icons?|flags?|avatar(s)?)(/|$)", re.I
)

def main():
    start = time.monotonic()
    if not SOURCE.is_file() or SOURCE.is_symlink():
        raise RuntimeError("BACKUP_ARCHIVE_MISSING_OR_SYMLINK")
    result = {
        "mode": "READ_ONLY_TAR_MANIFEST",
        "archive": str(SOURCE),
        "compressed_bytes": SOURCE.stat().st_size,
        "scanned_entries": 0,
        "ordinary_image_entries": 0,
        "potential_media_entries": 0,
        "next_image_cache_entries": 0,
        "nested_archives": 0,
        "candidate_paths": [],
        "cache_sample_paths": [],
        "nested_archive_paths": [],
        "candidate_categories": {},
        "truncated": False,
        "warnings": [
            "An archive pathname does not prove that an image belongs to a campaign.",
            "Nothing was extracted or restored. No web or database writes."
        ]
    }
    groups = collections.Counter()
    with tarfile.open(SOURCE, mode="r|gz") as tar:
        for entry in tar:
            result["scanned_entries"] += 1
            if (result["scanned_entries"] >= MAX_ENTRIES or
                time.monotonic()-start > MAX_SECONDS):
                result["truncated"] = True
                break
            name = entry.name.replace("\\", "/").lstrip("./")
            if not entry.isfile() or entry.issym() or entry.islnk():
                continue
            if SENSITIVE.search(name) or entry.size > MAX_BYTES_SINGLE:
                continue
            if ARCHIVE.search(name):
                result["nested_archives"] += 1
                if len(result["nested_archive_paths"]) < 30:
                    result["nested_archive_paths"].append({"path": name, "bytes": entry.size})
                continue
            if CACHE.search(name):
                result["next_image_cache_entries"] += 1
                if len(result["cache_sample_paths"]) < 15:
                    result["cache_sample_paths"].append(name)
                continue
            if not IMAGE.search(name):
                continue
            result["ordinary_image_entries"] += 1
            if not PUBLIC_MEDIA.search(name):
                continue
            result["potential_media_entries"] += 1
            if EXCLUDE_GENERIC.search(name):
                groups["generic_site_assets"] += 1
            elif re.search(r"(^|/)(uploads?|media|photos?|gallery)(/|$)", name, re.I):
                groups["uploaded_or_gallery_media"] += 1
            else:
                groups["public_assets"] += 1
            if len(result["candidate_paths"]) < MAX_CANDIDATES_REPORTED:
                result["candidate_paths"].append({"path": name, "bytes": entry.size})
    result["candidate_categories"] = dict(groups)
    result["elapsed_seconds"] = round(time.monotonic()-start, 2)
    OUTPUT.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with os.fdopen(os.open(OUTPUT, os.O_CREAT|os.O_TRUNC|os.O_WRONLY, 0o600), "w", encoding="utf-8") as out:
        json.dump(result, out, ensure_ascii=False, indent=2)
    print("BACKUP_ARCHIVE_INSPECTION:", json.dumps({
        "scanned_entries": result["scanned_entries"],
        "ordinary_image_entries": result["ordinary_image_entries"],
        "potential_media_entries": result["potential_media_entries"],
        "next_image_cache_entries": result["next_image_cache_entries"],
        "nested_archives": result["nested_archives"],
        "candidate_categories": result["candidate_categories"],
        "truncated": result["truncated"]
    }, ensure_ascii=False))
    for candidate in result["candidate_paths"][:20]:
        print("CANDIDATE_PATH:", candidate["path"], "BYTES:", candidate["bytes"])
    for candidate in result["nested_archive_paths"][:10]:
        print("NESTED_ARCHIVE:", candidate["path"], "BYTES:", candidate["bytes"])
    print("REPORT:", OUTPUT)
    print("EXTRACTED_FILES: 0")
    print("DATABASE_CHANGED: NO")

if __name__ == "__main__":
    try:
        main()
    except Exception as ex:
        print("ARCHIVE_INSPECTION_FAILED:", str(ex)[:200])
        raise SystemExit(1)
