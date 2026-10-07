#!/usr/bin/env python3
"""Dependency-free validation harness for MEMBER VOICES implementation Preview.

Checks:
1. SQLite Schema v1.1 executes cleanly in an in-memory SQLite database.
2. Source Resolver Safety Gate compiles/imports and enforces key safety cases.
3. Extraction JSON Schema is valid JSON and exposes the expected contract version.
4. Every Preview JSON satisfies critical contract invariants.
5. Preview source_ref_key values match the Source Resolver deterministic key function.

Run from anywhere:
    python member_voices/tests/validate_member_voices_impl.py
"""

from __future__ import annotations

import importlib.util
import json
import sqlite3
import sys
import tempfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
MV_ROOT = HERE.parent
SQL_PATH = MV_ROOT / "sql" / "member_voices_schema_v1_1.sql"
SCHEMA_PATH = MV_ROOT / "schemas" / "member_voices_extraction_v1_1.schema.json"
RESOLVER_PATH = MV_ROOT / "source_resolver.py"
PREVIEW_DIR = MV_ROOT / "preview" / "2026-10-08"

EXPECTED_PREVIEW_FILES = {
    "26676_matsuda_zero_voice.json",
    "25481_kosaka_audition.json",
    "35133_kosaka_center_temporal.json",
    "65922_ota_values_expression.json",
    "67706_ota_song_anchor.json",
    "71234_poka_speaker_mismatch_block.json",
}

ALLOWED_COMPARISON_RELATIONS = {
    "DUPLICATE",
    "CONSISTENT",
    "ELABORATION",
    "REFRAMING",
    "EXPLICIT_CHANGE",
    "TENSION",
    "UNCLEAR",
}


def load_resolver():
    spec = importlib.util.spec_from_file_location("member_voices_source_resolver", RESOLVER_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not create import spec for source_resolver.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def validate_sqlite_schema() -> dict:
    sql = SQL_PATH.read_text(encoding="utf-8")
    conn = sqlite3.connect(":memory:")
    try:
        conn.executescript(sql)
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        required = {
            "schema_meta",
            "processing_runs",
            "source_references",
            "source_resolution_events",
            "meaning_units",
            "voice_candidates",
            "voice_candidate_meaning_units",
            "voices",
            "voice_meaning_units",
            "provisional_anchors",
            "thread_candidates",
            "candidate_thread_memberships",
            "voice_thread_memberships",
            "comparison_candidates",
            "comparison_records",
            "processing_logs",
        }
        missing = required - tables
        assert not missing, f"SQLite schema missing tables: {sorted(missing)}"
        row = conn.execute(
            "SELECT schema_version, contract_version FROM schema_meta WHERE schema_name='member_voices'"
        ).fetchone()
        assert row == ("1.1", "1.0"), f"schema_meta mismatch: {row}"
        return {"tables": len(required), "schema_meta": list(row)}
    finally:
        conn.close()


def write_fixture(
    root: Path,
    member_folder: str,
    year: str,
    post_dir_name: str,
    metadata: dict,
    article_text: str = "本文",
) -> Path:
    post_dir = root / "BLOG" / member_folder / year / post_dir_name
    post_dir.mkdir(parents=True)
    (post_dir / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False),
        encoding="utf-8",
    )
    (post_dir / "article.txt").write_text(article_text, encoding="utf-8")
    return post_dir


def validate_source_resolver(resolver) -> dict:
    assert resolver.normalize_person_name("松田 好花") == "松田好花"

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)

        matsuda = write_fixture(
            root,
            "松田好花",
            "2018",
            "2018-11-08_26676_fixture",
            {
                "article_id": "26676",
                "author": "松田好花",
                "published_at": "2018-11-08T06:53:00+09:00",
                "source_url": "https://www.hinatazaka46.com/s/official/diary/detail/26676",
                "canonical_key": "0ce097438fcc220300690cd4",
                "text_sha256": "fixture",
                "title": "fixture",
            },
        )
        passed = resolver.resolve_post(
            matsuda,
            expected_speaker="松田 好花",
            archive_root=root,
        )
        assert passed["source_resolution"]["gate_status"] == "PASS"
        assert passed["source_resolution"]["confirmed_speaker"] == "松田好花"

        poka = write_fixture(
            root,
            "ポカ",
            "2026",
            "2026-10-04_71234_fixture",
            {
                "article_id": "71234",
                "author": "ポカ",
                "published_at": "2026-10-04T08:57:00+09:00",
                "source_url": "https://www.hinatazaka46.com/s/official/diary/detail/71234",
                "canonical_key": "1af8e605fec68ffdf5ee3810",
                "text_sha256": "fixture",
                "title": "きどあいらくいえーい",
            },
            article_text="本文に小坂菜緒という名前があってもSpeaker根拠にはしない",
        )
        blocked = resolver.resolve_post(
            poka,
            expected_speaker="小坂 菜緒",
            archive_root=root,
        )
        assert blocked["source_resolution"]["gate_status"] == "BLOCK"
        assert blocked["source_resolution"]["block_reason"] == "SPEAKER_MISMATCH"
        assert blocked["source_resolution"]["speaker_confirmed"] is False

        conflict = write_fixture(
            root,
            "小坂菜緒",
            "2020",
            "2020-01-01_1_fixture",
            {
                "article_id": "1",
                "author": "金村美玖",
                "published_at": "2020-01-01T00:00:00+09:00",
                "source_url": "https://www.hinatazaka46.com/s/official/diary/detail/1",
                "title": "fixture",
            },
        )
        locator_conflict = resolver.resolve_post(conflict, archive_root=root)
        assert locator_conflict["source_resolution"]["gate_status"] == "BLOCK"
        assert locator_conflict["source_resolution"]["block_reason"] == "LOCATOR_AUTHOR_CONFLICT"

    return {
        "name_whitespace_normalization": "PASS",
        "expected_speaker_pass": "PASS",
        "speaker_mismatch_block": "PASS",
        "locator_author_conflict_block": "PASS",
    }


def validate_schema_document() -> dict:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["properties"]["schema_version"]["const"] == "1.1"
    assert schema["properties"]["contract_version"]["const"] == "1.0"
    return {
        "json_parse": "PASS",
        "dialect": schema["$schema"],
        "title": schema["title"],
    }


def validate_preview_file(path: Path, resolver) -> dict:
    obj = json.loads(path.read_text(encoding="utf-8"))
    errors: list[str] = []

    if obj.get("schema_version") != "1.1":
        errors.append("schema_version")
    if obj.get("contract_version") != "1.0":
        errors.append("contract_version")

    source = obj.get("source") or {}
    resolution = obj.get("source_resolution") or {}
    native = source.get("native_locator") or {}

    for key in ("source_ref_key", "source_native_id", "archive_reference", "text_reference"):
        if not source.get(key):
            errors.append(f"source.{key}")

    if not native.get("article_id") or not native.get("local_dir"):
        errors.append("native_locator")

    expected_source_ref = resolver.source_ref_key(native)
    if source.get("source_ref_key") != expected_source_ref:
        errors.append(
            f"source_ref_key_mismatch:{source.get('source_ref_key')}!={expected_source_ref}"
        )

    gate = resolution.get("gate_status")
    if gate == "BLOCK":
        for key in (
            "meaning_units",
            "voice_candidates",
            "thread_candidates",
            "comparison_candidates",
        ):
            if obj.get(key) != []:
                errors.append(f"blocked_source_has_{key}")
        if resolution.get("speaker_confirmed") is not False:
            errors.append("blocked_speaker_confirmed")
    elif gate == "PASS":
        if resolution.get("speaker_confirmed") is not True:
            errors.append("pass_speaker_not_confirmed")
        if not resolution.get("confirmed_speaker"):
            errors.append("confirmed_speaker_missing")
    else:
        errors.append("invalid_gate_status")

    meaning_units = {
        item.get("meaning_unit_id"): item
        for item in obj.get("meaning_units", [])
    }
    voice_candidates = {
        item.get("candidate_key"): item
        for item in obj.get("voice_candidates", [])
    }

    for mu_id, item in meaning_units.items():
        if not mu_id or not mu_id.startswith("mu_"):
            errors.append("meaning_unit_key")
        if not item.get("decision_reason"):
            errors.append(f"{mu_id}:decision_reason")
        locator = item.get("source_locator") or {}
        if not locator.get("article_id") or not locator.get("text_reference"):
            errors.append(f"{mu_id}:source_returnability")

    for vc_id, item in voice_candidates.items():
        if not vc_id or not vc_id.startswith("vc_"):
            errors.append("candidate_key")
        refs = item.get("meaning_unit_references") or []
        if not refs:
            errors.append(f"{vc_id}:meaning_unit_references")
        for ref in refs:
            if ref not in meaning_units:
                errors.append(f"{vc_id}:unknown_meaning_unit:{ref}")
        locator = item.get("source_locator") or {}
        if not locator.get("article_id") or not locator.get("text_reference"):
            errors.append(f"{vc_id}:source_returnability")
        if not item.get("decision_reason"):
            errors.append(f"{vc_id}:decision_reason")

    for thread in obj.get("thread_candidates", []):
        if thread.get("thread_type") == "ANCHOR":
            if not thread.get("anchor") or thread.get("normalized_primary_topic") is not None:
                errors.append("anchor_thread_shape")
        elif thread.get("thread_type") == "THEME":
            if thread.get("anchor") is not None or not thread.get("normalized_primary_topic"):
                errors.append("theme_thread_shape")
        else:
            errors.append("thread_type")
        for vc_id in thread.get("voice_candidate_keys", []):
            if vc_id not in voice_candidates:
                errors.append(f"thread_unknown_candidate:{vc_id}")

    for comparison in obj.get("comparison_candidates", []):
        relation = comparison.get("relation_to_prior")
        if relation not in ALLOWED_COMPARISON_RELATIONS:
            errors.append("comparison_relation")
        prior = comparison.get("prior_candidate_key")
        current = comparison.get("current_candidate_key")
        if prior not in voice_candidates or current not in voice_candidates:
            errors.append("comparison_unknown_candidate")
        if prior == current:
            errors.append("comparison_same_candidate")
        if relation == "EXPLICIT_CHANGE" and comparison.get("explicit_change_claimed") is not True:
            errors.append("explicit_change_flag")

    assert not errors, f"{path.name}: {errors}"
    return {
        "source_native_id": source.get("source_native_id"),
        "gate": gate,
        "meaning_units": len(obj.get("meaning_units", [])),
        "voice_candidates": len(obj.get("voice_candidates", [])),
        "threads": len(obj.get("thread_candidates", [])),
        "comparisons": len(obj.get("comparison_candidates", [])),
    }


def validate_previews(resolver) -> dict:
    actual = {p.name for p in PREVIEW_DIR.glob("*.json")}
    missing = EXPECTED_PREVIEW_FILES - actual
    assert not missing, f"Missing expected Preview files: {sorted(missing)}"

    result = {}
    for filename in sorted(EXPECTED_PREVIEW_FILES):
        result[filename] = validate_preview_file(PREVIEW_DIR / filename, resolver)
    return result


def main() -> int:
    resolver = load_resolver()

    report = {
        "sqlite_schema": validate_sqlite_schema(),
        "source_resolver": validate_source_resolver(resolver),
        "extraction_schema": validate_schema_document(),
        "preview": validate_previews(resolver),
        "result": "PASS",
    }

    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
