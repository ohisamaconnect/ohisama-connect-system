#!/usr/bin/env python3
"""MEMBER VOICES Source Resolver Safety Gate v1.0.

This module resolves Personal Blog Archive posts before any Meaning Unit or
VOICE extraction. Search hits, query text, or member-name mentions are never
accepted as Speaker evidence.

The resolver deliberately FAILS CLOSED:
- missing metadata -> BLOCK
- missing/invalid Native Locator -> BLOCK
- Author mismatch -> BLOCK
- missing article.txt -> BLOCK
- ambiguous attribution -> BLOCK

source_ref_key is an internal join key only. It is not a permanent Source ID.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Optional


VERSION = "source-resolver-v1.0"
SOURCE_SYSTEM = "PERSONAL_BLOG_ARCHIVE"
SOURCE_TYPE = "OFFICIAL_MEMBER_BLOG"
LOCATOR_TYPE = "PERSONAL_BLOG_ARCHIVE_NATIVE"

BLOCK_REASONS = {
    "SOURCE_NOT_FOUND",
    "METADATA_MISSING",
    "AUTHOR_MISSING",
    "NATIVE_LOCATOR_MISSING",
    "NATIVE_LOCATOR_MISMATCH",
    "LOCATOR_AUTHOR_CONFLICT",
    "SPEAKER_MISMATCH",
    "TEXT_REFERENCE_MISSING",
    "AMBIGUOUS_SOURCE",
    "UNSUPPORTED_SOURCE",
    "OTHER",
}


def normalize_text(value: Optional[str]) -> str:
    if value is None:
        return ""
    value = unicodedata.normalize("NFKC", str(value))
    return re.sub(r"\s+", " ", value).strip()


def normalize_person_name(value: Optional[str]) -> str:
    """Normalize a person label for identity comparison without changing display text."""
    return re.sub(r"\\s+", "", normalize_text(value))


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def short_hash(prefix: str, payload: Any) -> str:
    digest = hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()[:24]
    return f"{prefix}{digest}"


def source_ref_key(native_locator: Dict[str, Any]) -> str:
    identity = {
        "source_system": SOURCE_SYSTEM,
        "locator_type": LOCATOR_TYPE,
        "article_id": normalize_text(native_locator.get("article_id")),
        "author": normalize_text(native_locator.get("author")),
        "published_at": normalize_text(native_locator.get("published_at")),
        "local_dir": normalize_text(native_locator.get("local_dir")),
        "original_url": normalize_text(native_locator.get("original_url")),
        "canonical_key": normalize_text(native_locator.get("canonical_key")),
    }
    return short_hash("src_", identity)


@dataclass
class Resolution:
    expected_speaker: Optional[str]
    metadata_author: Optional[str]
    folder_member: Optional[str]
    native_id_checked: bool
    locator_checked: bool
    author_checked: bool
    speaker_confirmed: bool
    confirmed_speaker: Optional[str]
    gate_status: str
    block_reason: Optional[str]
    decision_reason: str


def block(
    *,
    reason: str,
    expected_speaker: Optional[str] = None,
    metadata_author: Optional[str] = None,
    folder_member: Optional[str] = None,
    native_id_checked: bool = False,
    locator_checked: bool = False,
    author_checked: bool = False,
    decision_reason: str,
) -> Resolution:
    if reason not in BLOCK_REASONS:
        reason = "OTHER"
    return Resolution(
        expected_speaker=expected_speaker,
        metadata_author=metadata_author,
        folder_member=folder_member,
        native_id_checked=native_id_checked,
        locator_checked=locator_checked,
        author_checked=author_checked,
        speaker_confirmed=False,
        confirmed_speaker=None,
        gate_status="BLOCK",
        block_reason=reason,
        decision_reason=decision_reason,
    )


def infer_folder_member(post_dir: Path) -> Optional[str]:
    """Infer BLOG/<member>/<year>/<post> member folder when structure is present."""
    try:
        return post_dir.parent.parent.name or None
    except Exception:
        return None


def relative_local_dir(post_dir: Path, archive_root: Optional[Path]) -> str:
    if archive_root is not None:
        try:
            return post_dir.resolve().relative_to(archive_root.resolve()).as_posix()
        except ValueError:
            pass
    return post_dir.as_posix()


def article_id_from_url(url: str) -> Optional[str]:
    if not url:
        return None
    match = re.search(r"/diary/detail/(\d+)", url)
    return match.group(1) if match else None


def resolve_post(
    post_dir: Path,
    *,
    expected_speaker: Optional[str] = None,
    archive_root: Optional[Path] = None,
) -> Dict[str, Any]:
    post_dir = Path(post_dir)
    expected = normalize_text(expected_speaker) or None

    if not post_dir.exists() or not post_dir.is_dir():
        resolution = block(
            reason="SOURCE_NOT_FOUND",
            expected_speaker=expected,
            decision_reason=f"Post directory does not exist: {post_dir}",
        )
        return artifact(None, resolution)

    metadata_path = post_dir / "metadata.json"
    text_path = post_dir / "article.txt"

    if not metadata_path.exists():
        resolution = block(
            reason="METADATA_MISSING",
            expected_speaker=expected,
            folder_member=infer_folder_member(post_dir),
            decision_reason="metadata.json is required before Speaker resolution.",
        )
        return artifact(None, resolution)

    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception as exc:
        resolution = block(
            reason="METADATA_MISSING",
            expected_speaker=expected,
            folder_member=infer_folder_member(post_dir),
            decision_reason=f"metadata.json could not be parsed: {exc}",
        )
        return artifact(None, resolution)

    article_id = normalize_text(metadata.get("article_id"))
    author = normalize_text(metadata.get("author"))
    published_at = normalize_text(metadata.get("published_at"))
    original_url = normalize_text(metadata.get("source_url") or metadata.get("original_url"))
    canonical_key = normalize_text(metadata.get("canonical_key"))
    text_hash = normalize_text(metadata.get("text_sha256"))
    folder_member = normalize_text(infer_folder_member(post_dir)) or None
    local_dir = relative_local_dir(post_dir, archive_root)

    native_locator = {
        "article_id": article_id or None,
        "author": author or None,
        "published_at": published_at or None,
        "local_dir": local_dir,
        "original_url": original_url or None,
        "text_hash": text_hash or None,
        "canonical_key": canonical_key or None,
    }

    if not article_id:
        resolution = block(
            reason="NATIVE_LOCATOR_MISSING",
            expected_speaker=expected,
            metadata_author=author or None,
            folder_member=folder_member,
            author_checked=bool(author),
            decision_reason="Article_ID is missing from metadata.",
        )
        return artifact(build_source(metadata, native_locator, text_path), resolution)

    if not author:
        resolution = block(
            reason="AUTHOR_MISSING",
            expected_speaker=expected,
            folder_member=folder_member,
            native_id_checked=True,
            locator_checked=True,
            decision_reason="Author is missing from metadata; Speaker cannot be inferred from search/body text.",
        )
        return artifact(build_source(metadata, native_locator, text_path), resolution)

    url_article_id = article_id_from_url(original_url)
    if url_article_id and url_article_id != article_id:
        resolution = block(
            reason="NATIVE_LOCATOR_MISMATCH",
            expected_speaker=expected,
            metadata_author=author,
            folder_member=folder_member,
            native_id_checked=True,
            author_checked=True,
            decision_reason=(
                f"metadata Article_ID={article_id} conflicts with Original_URL Article_ID={url_article_id}."
            ),
        )
        return artifact(build_source(metadata, native_locator, text_path), resolution)

    if not text_path.exists():
        resolution = block(
            reason="TEXT_REFERENCE_MISSING",
            expected_speaker=expected,
            metadata_author=author,
            folder_member=folder_member,
            native_id_checked=True,
            locator_checked=True,
            author_checked=True,
            decision_reason="article.txt is missing; extraction cannot remain returnable to source text.",
        )
        return artifact(build_source(metadata, native_locator, text_path), resolution)

    # Metadata Author is the primary attribution check for this source type.
    # If a requested/expected Speaker disagrees, stop before any semantic extraction.
    if expected and normalize_person_name(author) != normalize_person_name(expected):
        resolution = block(
            reason="SPEAKER_MISMATCH",
            expected_speaker=expected,
            metadata_author=author,
            folder_member=folder_member,
            native_id_checked=True,
            locator_checked=True,
            author_checked=True,
            decision_reason=(
                f"Expected Speaker '{expected}' does not match metadata Author '{author}'. "
                "Extraction is blocked before Meaning Unit generation."
            ),
        )
        return artifact(build_source(metadata, native_locator, text_path), resolution)

    # The BLOG/<member>/... folder is a cross-check, never a substitute for Author.
    # A disagreement between trusted metadata and the archive locator fails closed.
    if folder_member and normalize_person_name(folder_member) != normalize_person_name(author):
        resolution = block(
            reason="LOCATOR_AUTHOR_CONFLICT",
            expected_speaker=expected,
            metadata_author=author,
            folder_member=folder_member,
            native_id_checked=True,
            locator_checked=True,
            author_checked=True,
            decision_reason=(
                "Archive member folder and metadata Author disagree. "
                "Do not infer Speaker from search results or article body text."
            ),
        )
        return artifact(build_source(metadata, native_locator, text_path), resolution)

    confirmed = author
    resolution = Resolution(
        expected_speaker=expected,
        metadata_author=author,
        folder_member=folder_member,
        native_id_checked=True,
        locator_checked=True,
        author_checked=True,
        speaker_confirmed=True,
        confirmed_speaker=confirmed,
        gate_status="PASS",
        block_reason=None,
        decision_reason=(
            "metadata Author and Native Locator were verified; Speaker is confirmed "
            "without using search ranking or body-text mentions."
        ),
    )
    return artifact(build_source(metadata, native_locator, text_path), resolution)


def build_source(
    metadata: Dict[str, Any],
    native_locator: Dict[str, Any],
    text_path: Path,
) -> Dict[str, Any]:
    return {
        "source_ref_key": source_ref_key(native_locator),
        "source_system": SOURCE_SYSTEM,
        "source_type": SOURCE_TYPE,
        "source_native_id": native_locator.get("article_id"),
        "source_title": metadata.get("title"),
        "publication": "日向坂46公式ブログ",
        "author": native_locator.get("author"),
        "speakers": [native_locator["author"]] if native_locator.get("author") else [],
        "published_at": native_locator.get("published_at"),
        "spoken_at": None,
        "original_url": native_locator.get("original_url"),
        "archive_reference": native_locator.get("local_dir"),
        "text_reference": text_path.as_posix(),
        "locator_type": LOCATOR_TYPE,
        "native_locator": native_locator,
        "text_hash": native_locator.get("text_hash"),
        "attribution_type": "METADATA_AUTHOR",
        "processing_status": "RESOLVED",
    }


def artifact(source: Optional[Dict[str, Any]], resolution: Resolution) -> Dict[str, Any]:
    if source is not None and resolution.gate_status == "BLOCK":
        source["processing_status"] = "BLOCKED"
    return {
        "resolver_version": VERSION,
        "source": source,
        "source_resolution": asdict(resolution),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="MEMBER VOICES Source Resolver Safety Gate")
    parser.add_argument("--post-dir", required=True, type=Path)
    parser.add_argument("--archive-root", type=Path)
    parser.add_argument("--expected-speaker")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    result = resolve_post(
        args.post_dir,
        expected_speaker=args.expected_speaker,
        archive_root=args.archive_root,
    )
    print(
        json.dumps(
            result,
            ensure_ascii=False,
            indent=2 if args.pretty else None,
            sort_keys=True,
        )
    )
    return 0 if result["source_resolution"]["gate_status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
