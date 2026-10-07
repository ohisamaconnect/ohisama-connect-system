#!/usr/bin/env python3
"""Validation for MEMBER VOICES incremental runner routing."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
MV_ROOT = HERE.parent
sys.path.insert(0, str(MV_ROOT))

from incremental_runner import run_case
from source_resolver import resolve_post


def write_post(root: Path, member: str, year: str, dirname: str, meta: dict, text: str = "本文") -> Path:
    p = root / "BLOG" / member / year / dirname
    p.mkdir(parents=True)
    (p / "metadata.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    (p / "article.txt").write_text(text, encoding="utf-8")
    return p


def artifact_from_fresh(root: Path, post: Path, expected: str, candidates: list[dict]) -> Path:
    fresh = resolve_post(post, expected_speaker=expected, archive_root=root)
    source = fresh["source"]
    obj = {
        "schema_version": "1.1",
        "contract_version": "1.0",
        "source": source,
        "source_resolution": fresh["source_resolution"],
        "meaning_units": [],
        "voice_candidates": candidates,
        "thread_candidates": [],
        "comparison_candidates": [],
        "warnings": [],
    }
    path = post / "approved_extraction.json"
    path.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
    return path


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)

        zero_post = write_post(
            root, "松田好花", "2018", "2018-11-08_26676_fixture",
            {
                "article_id": "26676",
                "author": "松田好花",
                "published_at": "2018-11-08T06:53:00+09:00",
                "source_url": "https://www.hinatazaka46.com/s/official/diary/detail/26676",
                "canonical_key": "zero",
                "text_sha256": "zero",
                "title": "zero",
            },
        )
        zero_art = artifact_from_fresh(root, zero_post, "松田 好花", [])

        promoted = []
        zero = run_case(
            archive_root=root,
            post_dir=zero_post,
            expected_speaker="松田 好花",
            extraction_artifact=zero_art,
            is_already_promoted=lambda _: False,
            promote_candidate=lambda c, e: promoted.append(c["candidate_key"]),
        )
        assert zero.branch == "ZERO_VOICE"
        assert zero.promoted_candidates == 0
        assert promoted == []

        block_post = write_post(
            root, "ポカ", "2026", "2026-10-04_71234_fixture",
            {
                "article_id": "71234",
                "author": "ポカ",
                "published_at": "2026-10-04T08:57:00+09:00",
                "source_url": "https://www.hinatazaka46.com/s/official/diary/detail/71234",
                "canonical_key": "block",
                "text_sha256": "block",
                "title": "block",
            },
            "本文に小坂菜緒という文字があってもSpeaker根拠にはしない",
        )
        blocked = run_case(
            archive_root=root,
            post_dir=block_post,
            expected_speaker="小坂 菜緒",
            extraction_artifact=None,
            is_already_promoted=lambda _: False,
            promote_candidate=lambda c, e: (_ for _ in ()).throw(AssertionError("must not promote")),
        )
        assert blocked.branch == "BLOCK"
        assert blocked.block_reason == "SPEAKER_MISMATCH"

        accept_post = write_post(
            root, "大田美月", "2025", "2025-10-01_65922_fixture",
            {
                "article_id": "65922",
                "author": "大田美月",
                "published_at": "2025-10-01T09:51:00+09:00",
                "source_url": "https://www.hinatazaka46.com/s/official/diary/detail/65922",
                "canonical_key": "accept",
                "text_sha256": "accept",
                "title": "accept",
            },
        )
        candidates = [
            {"candidate_key": "vc_existing", "candidate_decision": "ACCEPT"},
            {"candidate_key": "vc_new", "candidate_decision": "ACCEPT"},
        ]
        accept_art = artifact_from_fresh(root, accept_post, "大田 美月", candidates)
        promoted2 = []
        accepted = run_case(
            archive_root=root,
            post_dir=accept_post,
            expected_speaker="大田 美月",
            extraction_artifact=accept_art,
            is_already_promoted=lambda k: k == "vc_existing",
            promote_candidate=lambda c, e: promoted2.append(c["candidate_key"]),
        )
        assert accepted.branch == "ACCEPT"
        assert accepted.accepted_candidates == 2
        assert accepted.skipped_existing_candidates == 1
        assert accepted.promoted_candidates == 1
        assert promoted2 == ["vc_new"]

    print(json.dumps({
        "zero_voice_branch": "PASS",
        "speaker_block_branch": "PASS",
        "accept_skip_existing_branch": "PASS",
        "result": "PASS",
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
