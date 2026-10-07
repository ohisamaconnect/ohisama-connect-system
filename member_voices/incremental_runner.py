#!/usr/bin/env python3
"""MEMBER VOICES incremental orchestration runner v0.1.

This runner connects the approved boundaries without pretending that a
production semantic extractor already exists.

Flow:
  Source Resolver (fresh archive input)
  -> approved Extraction Artifact Adapter
  -> ACCEPT / ZERO_VOICE / BLOCK routing
  -> injected promotion callback

The extraction artifact adapter is PILOT-ONLY. It reuses an already-reviewed
Schema v1.1 extraction JSON for the same source and validates that the fresh
resolver identity still matches. A future production semantic extractor can
replace only this adapter while keeping the routing/promotion contract.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Callable, Any, Mapping

from source_resolver import resolve_post


@dataclass(frozen=True)
class CaseResult:
    source_native_id: str | None
    branch: str
    gate_status: str
    block_reason: str | None
    accepted_candidates: int
    promoted_candidates: int
    skipped_existing_candidates: int
    candidate_keys: list[str]


def load_approved_extraction_artifact(
    path: Path,
    *,
    fresh_source: Mapping[str, Any],
) -> dict[str, Any]:
    obj = json.loads(Path(path).read_text(encoding="utf-8"))
    if obj.get("schema_version") != "1.1":
        raise ValueError("Extraction artifact schema_version must be 1.1")
    if obj.get("contract_version") != "1.0":
        raise ValueError("Extraction artifact contract_version must be 1.0")

    old_source = obj.get("source") or {}
    checks = {
        "source_native_id": (old_source.get("source_native_id"), fresh_source.get("source_native_id")),
        "source_ref_key": (old_source.get("source_ref_key"), fresh_source.get("source_ref_key")),
        "original_url": (old_source.get("original_url"), fresh_source.get("original_url")),
        "text_hash": (old_source.get("text_hash"), fresh_source.get("text_hash")),
    }
    mismatches = {
        k: {"artifact": a, "fresh": b}
        for k, (a, b) in checks.items()
        if a != b
    }
    if mismatches:
        raise ValueError(f"Extraction artifact source mismatch: {mismatches}")
    return obj


def run_case(
    *,
    archive_root: Path,
    post_dir: Path,
    expected_speaker: str,
    extraction_artifact: Path | None,
    is_already_promoted: Callable[[str], bool],
    promote_candidate: Callable[[dict[str, Any], dict[str, Any]], Any],
) -> CaseResult:
    resolved = resolve_post(
        post_dir,
        expected_speaker=expected_speaker,
        archive_root=archive_root,
    )
    resolution = resolved["source_resolution"]
    source = resolved.get("source") or {}
    native_id = source.get("source_native_id")

    if resolution["gate_status"] == "BLOCK":
        return CaseResult(
            source_native_id=native_id,
            branch="BLOCK",
            gate_status="BLOCK",
            block_reason=resolution.get("block_reason"),
            accepted_candidates=0,
            promoted_candidates=0,
            skipped_existing_candidates=0,
            candidate_keys=[],
        )

    if extraction_artifact is None:
        raise ValueError("PASS source requires an approved extraction artifact in Pilot adapter mode")

    extraction = load_approved_extraction_artifact(
        extraction_artifact,
        fresh_source=source,
    )

    accepted = [
        c for c in extraction.get("voice_candidates", [])
        if c.get("candidate_decision") == "ACCEPT"
    ]

    if not accepted:
        return CaseResult(
            source_native_id=native_id,
            branch="ZERO_VOICE",
            gate_status="PASS",
            block_reason=None,
            accepted_candidates=0,
            promoted_candidates=0,
            skipped_existing_candidates=0,
            candidate_keys=[],
        )

    promoted = 0
    skipped = 0
    keys: list[str] = []
    for candidate in accepted:
        key = candidate["candidate_key"]
        keys.append(key)
        if is_already_promoted(key):
            skipped += 1
            continue
        promote_candidate(candidate, extraction)
        promoted += 1

    return CaseResult(
        source_native_id=native_id,
        branch="ACCEPT",
        gate_status="PASS",
        block_reason=None,
        accepted_candidates=len(accepted),
        promoted_candidates=promoted,
        skipped_existing_candidates=skipped,
        candidate_keys=keys,
    )


def result_json(result: CaseResult) -> str:
    return json.dumps(asdict(result), ensure_ascii=False, sort_keys=True)
