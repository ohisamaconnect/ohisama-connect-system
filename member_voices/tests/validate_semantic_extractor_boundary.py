#!/usr/bin/env python3
"""Validation for provider-neutral MEMBER VOICES semantic extraction boundary."""

from __future__ import annotations

import copy
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MV_ROOT = HERE.parent
sys.path.insert(0, str(MV_ROOT))

from semantic_extractor import (
    ApprovedArtifactFixtureProvider,
    ExtractionBoundaryError,
    build_request,
    extract_and_validate,
    load_json,
)


SCHEMA = load_json(MV_ROOT / "schemas" / "member_voices_extraction_v1_1.schema.json")


def base_resolver(text: bytes, *, author: str = "大田美月", article_id: str = "65922") -> dict:
    local_dir = f"BLOG/{author}/2025/2025-10-01_{article_id}_fixture"
    text_hash = hashlib.sha256(text).hexdigest()
    return {
        "source": {
            "source_ref_key": "src_aaaaaaaaaaaaaaaaaaaaaaaa",
            "source_system": "PERSONAL_BLOG_ARCHIVE",
            "source_type": "OFFICIAL_MEMBER_BLOG",
            "source_native_id": article_id,
            "source_title": "fixture",
            "publication": "日向坂46公式ブログ",
            "author": author,
            "speakers": [author],
            "published_at": "2025-10-01T09:51:00+09:00",
            "spoken_at": None,
            "original_url": f"https://www.hinatazaka46.com/s/official/diary/detail/{article_id}",
            "archive_reference": local_dir,
            "text_reference": f"/tmp/{local_dir}/article.txt",
            "locator_type": "PERSONAL_BLOG_ARCHIVE_NATIVE",
            "native_locator": {
                "article_id": article_id,
                "author": author,
                "published_at": "2025-10-01T09:51:00+09:00",
                "local_dir": local_dir,
                "original_url": f"https://www.hinatazaka46.com/s/official/diary/detail/{article_id}",
                "text_hash": text_hash,
                "canonical_key": "fixture",
            },
            "text_hash": text_hash,
            "attribution_type": "METADATA_AUTHOR",
            "processing_status": "RESOLVED",
        },
        "source_resolution": {
            "expected_speaker": "大田 美月",
            "metadata_author": author,
            "folder_member": author,
            "native_id_checked": True,
            "locator_checked": True,
            "author_checked": True,
            "speaker_confirmed": True,
            "confirmed_speaker": author,
            "gate_status": "PASS",
            "block_reason": None,
            "decision_reason": "fixture PASS",
        },
    }


def valid_artifact_payload(text_reference: str) -> dict:
    mu = {
        "meaning_unit_id": "mu_bbbbbbbbbbbbbbbbbbbbbbbb",
        "speaker": "大田美月",
        "source_locator": {
            "locator_type": "PERSONAL_BLOG_ARCHIVE_TEXT",
            "article_id": "65922",
            "text_reference": text_reference,
            "start_marker": None,
            "end_marker": None,
            "excerpt": "fixture excerpt",
        },
        "central_proposition": "本人が大切にしている価値観を明示した。",
        "unit_type": "SELF_VALUE",
        "referenced_period": None,
        "candidate_categories": ["SELF", "REFLECTION"],
        "candidate_primary_topic": "自分らしさを大切にする価値観",
        "candidate_secondary_topics": ["桜梅桃李"],
        "candidate_relations": [],
        "candidate_primary_anchor": None,
        "knowledge_value": "HIGH",
        "voice_eligible": True,
        "decision_reason": "継続的な自己理解として比較可能。",
    }
    vc = {
        "candidate_key": "vc_cccccccccccccccccccccccc",
        "meaning_unit_references": [mu["meaning_unit_id"]],
        "speaker": "大田美月",
        "title": "大田美月｜自分らしさを大切にする価値観",
        "summary": "大田美月は、自分らしく生きることを大切な価値観として記した。",
        "source_locator": dict(mu["source_locator"]),
        "published_at": "2025-10-01T09:51:00+09:00",
        "spoken_at": None,
        "referenced_period": None,
        "temporal_perspective": "CURRENT_SELF_DEFINITION",
        "topic_categories": ["SELF", "REFLECTION"],
        "primary_topic": "自分らしさを大切にする価値観",
        "secondary_topics": ["桜梅桃李"],
        "primary_anchor": None,
        "related_members": [],
        "related_songs": [],
        "related_lives": [],
        "related_events": [],
        "related_releases": [],
        "knowledge_value": "HIGH",
        "attribution": "SELF_STATEMENT",
        "candidate_decision": "ACCEPT",
        "decision_reason": "本人の自己理解として持続的価値がある。",
    }
    return {
        "meaning_units": [mu],
        "voice_candidates": [vc],
        "thread_candidates": [],
        "comparison_candidates": [],
        "warnings": [],
    }


def main() -> int:
    text = "fixture article text".encode("utf-8")
    resolver = base_resolver(text)
    request = build_request(run_id="semantic-boundary-test", resolver_artifact=resolver, article_bytes=text)
    stable_ref = request.source["text_reference"]
    payload = valid_artifact_payload(stable_ref)

    provider = ApprovedArtifactFixtureProvider(payload)
    artifact = extract_and_validate(provider=provider, request=request, schema=SCHEMA)
    assert artifact["source"]["source_native_id"] == "65922"
    assert artifact["source"]["text_reference"] == stable_ref
    assert artifact["voice_candidates"][0]["speaker"] == "大田美月"

    # Zero VOICE is valid.
    zero_provider = ApprovedArtifactFixtureProvider({
        "meaning_units": [],
        "voice_candidates": [],
        "thread_candidates": [],
        "comparison_candidates": [],
        "warnings": [],
    })
    zero = extract_and_validate(provider=zero_provider, request=request, schema=SCHEMA)
    assert zero["voice_candidates"] == []

    # Provider cannot overwrite source identity.
    class BadTopLevelProvider:
        provider_name = "bad"
        extractor_version = "bad-v1"
        def extract(self, request):
            return {
                **payload,
                "source": {"author": "別人"},
            }

    try:
        extract_and_validate(provider=BadTopLevelProvider(), request=request, schema=SCHEMA)
        raise AssertionError("forbidden provider source field was accepted")
    except ExtractionBoundaryError as exc:
        assert "forbidden top-level fields" in str(exc)

    # Wrong speaker is rejected after Schema validation.
    wrong = copy.deepcopy(payload)
    wrong["voice_candidates"][0]["speaker"] = "別人"
    try:
        extract_and_validate(
            provider=ApprovedArtifactFixtureProvider(wrong),
            request=request,
            schema=SCHEMA,
        )
        raise AssertionError("wrong speaker was accepted")
    except ExtractionBoundaryError as exc:
        assert "Speaker mismatch" in str(exc)

    # Wrong text locator is rejected.
    wrong_locator = copy.deepcopy(payload)
    wrong_locator["meaning_units"][0]["source_locator"]["text_reference"] = "other/article.txt"
    try:
        extract_and_validate(
            provider=ApprovedArtifactFixtureProvider(wrong_locator),
            request=request,
            schema=SCHEMA,
        )
        raise AssertionError("wrong source locator was accepted")
    except ExtractionBoundaryError as exc:
        assert "text_reference mismatch" in str(exc)

    # Text bytes must match Archive hash.
    try:
        build_request(
            run_id="bad-hash",
            resolver_artifact=resolver,
            article_bytes=b"changed body",
        )
        raise AssertionError("hash mismatch was accepted")
    except ExtractionBoundaryError as exc:
        assert "SHA256 mismatch" in str(exc)

    # BLOCK never reaches provider.
    blocked = copy.deepcopy(resolver)
    blocked["source_resolution"]["gate_status"] = "BLOCK"
    blocked["source_resolution"]["speaker_confirmed"] = False
    blocked["source_resolution"]["confirmed_speaker"] = None
    blocked["source_resolution"]["block_reason"] = "SPEAKER_MISMATCH"
    try:
        build_request(run_id="blocked", resolver_artifact=blocked, article_bytes=text)
        raise AssertionError("BLOCK source entered semantic extraction")
    except ExtractionBoundaryError as exc:
        assert "must PASS" in str(exc)

    print(json.dumps({
        "valid_artifact": "PASS",
        "zero_voice": "PASS",
        "provider_source_identity_override": "BLOCKED",
        "wrong_speaker": "BLOCKED",
        "wrong_locator": "BLOCKED",
        "text_hash_mismatch": "BLOCKED",
        "resolver_block_before_provider": "PASS",
        "result": "PASS",
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
