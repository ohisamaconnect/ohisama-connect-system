#!/usr/bin/env python3
"""Validation for MEMBER VOICES semantic provider contract v0.1."""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MV_ROOT = HERE.parent
sys.path.insert(0, str(MV_ROOT))

from semantic_extractor import ExtractionBoundaryError, ExtractionRequest
from semantic_provider_contract import (
    ProviderConfig,
    approved_artifact_to_fixture_payload,
    materialize_provider_payload,
)
from semantic_providers import wire_schema


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


PROVIDER_SCHEMA = load(MV_ROOT / "schemas" / "member_voices_provider_payload_v0_1.schema.json")
ARTIFACT_SCHEMA = load(MV_ROOT / "schemas" / "member_voices_extraction_v1_1.schema.json")
PROMPT = (MV_ROOT / "prompts" / "MEMBER_VOICES_SEMANTIC_PROMPT_v0.1.md").read_text(encoding="utf-8")


def article_text_for(artifact: dict) -> str:
    pieces: list[str] = []
    for mu in artifact.get("meaning_units", []):
        excerpt = mu["source_locator"].get("excerpt")
        if excerpt:
            pieces.append(excerpt)
        anchor = mu.get("candidate_primary_anchor")
        if anchor:
            pieces.extend(anchor.get("evidence", []))
    for vc in artifact.get("voice_candidates", []):
        anchor = vc.get("primary_anchor")
        if anchor:
            pieces.extend(anchor.get("evidence", []))
    for comp in artifact.get("comparison_candidates", []):
        pieces.extend(comp.get("evidence", []))
    return "\n---\n".join(dict.fromkeys(pieces))


def request_from_artifact(artifact: dict) -> ExtractionRequest:
    text = article_text_for(artifact)
    return ExtractionRequest(
        run_id="provider-contract-test",
        source=artifact["source"],
        source_resolution=artifact["source_resolution"],
        article_text=text,
        article_sha256=artifact["source"].get("text_hash") or "fixture",
    )


def semantic_projection(artifact: dict) -> dict:
    return {
        "meaning_units": [
            {
                k: mu.get(k)
                for k in [
                    "central_proposition",
                    "unit_type",
                    "referenced_period",
                    "candidate_categories",
                    "candidate_primary_topic",
                    "candidate_secondary_topics",
                    "candidate_relations",
                    "candidate_primary_anchor",
                    "knowledge_value",
                    "voice_eligible",
                    "decision_reason",
                ]
            }
            for mu in artifact["meaning_units"]
        ],
        "voice_candidates": [
            {
                k: vc.get(k)
                for k in [
                    "title",
                    "summary",
                    "referenced_period",
                    "temporal_perspective",
                    "topic_categories",
                    "primary_topic",
                    "secondary_topics",
                    "primary_anchor",
                    "related_members",
                    "related_songs",
                    "related_lives",
                    "related_events",
                    "related_releases",
                    "knowledge_value",
                    "attribution",
                    "candidate_decision",
                    "decision_reason",
                ]
            }
            for vc in artifact["voice_candidates"]
        ],
        "threads": [
            {
                "thread_type": t["thread_type"],
                "natural_key": t["natural_key"],
                "normalized_primary_topic": t["normalized_primary_topic"],
                "anchor": t["anchor"],
                "decision_reason": t["decision_reason"],
            }
            for t in artifact["thread_candidates"]
        ],
        "comparisons": [
            {
                k: c.get(k)
                for k in [
                    "relation_to_prior",
                    "difference_summary",
                    "explicit_change_claimed",
                    "comparison_confidence",
                    "evidence",
                ]
            }
            for c in artifact["comparison_candidates"]
        ],
    }


def main() -> int:
    config = ProviderConfig(
        provider_name="google-gemini",
        model_id="gemini-3.8-flash",
        thinking_level="medium",
    )
    extractor_version = config.extractor_version(
        prompt_text=PROMPT,
        provider_schema=PROVIDER_SCHEMA,
    )
    assert extractor_version == config.extractor_version(
        prompt_text=PROMPT,
        provider_schema=PROVIDER_SCHEMA,
    )
    assert extractor_version != config.extractor_version(
        prompt_text=PROMPT + "\nchanged",
        provider_schema=PROVIDER_SCHEMA,
    )

    # Provider-facing wire schema drops regex pattern constraints, so the prompt
    # must explicitly preserve the Contract-owned local reference grammar.
    for token in [
        "Meaning Unit `unit_ref`: `U1`",
        "VOICE Candidate `candidate_ref`: `V1`",
        "Thread Candidate `thread_ref`: `T1`",
        "Comparison Candidate `comparison_ref`: `C1`",
        "Do not use alternate names such as `mu_1`, `vc_1`, `thread_1`, `cmp_1`",
    ]:
        assert token in PROMPT, f"prompt missing local-ref contract token: {token}"
    # Wire schema is intentionally weaker; local schema remains authoritative.
    wire = wire_schema(PROVIDER_SCHEMA)
    assert "$schema" not in wire
    assert "$id" not in wire
    assert "pattern" not in json.dumps(wire, ensure_ascii=False)
    assert "uniqueItems" not in json.dumps(wire, ensure_ascii=False)

    results = {}

    for filename in [
        "26676_matsuda_zero_voice.json",
        "65922_ota_values_expression.json",
    ]:
        gold = load(MV_ROOT / "preview" / "2026-10-08" / filename)
        request = request_from_artifact(gold)
        payload = approved_artifact_to_fixture_payload(gold)
        out1 = materialize_provider_payload(
            request=request,
            provider_payload=payload,
            provider_schema=PROVIDER_SCHEMA,
            artifact_schema=ARTIFACT_SCHEMA,
            extractor_version=extractor_version,
        )
        out2 = materialize_provider_payload(
            request=request,
            provider_payload=payload,
            provider_schema=PROVIDER_SCHEMA,
            artifact_schema=ARTIFACT_SCHEMA,
            extractor_version=extractor_version,
        )
        assert out1 == out2
        assert semantic_projection(out1) == semantic_projection(gold)
        results[filename] = {
            "meaning_units": len(out1["meaning_units"]),
            "voice_candidates": len(out1["voice_candidates"]),
            "threads": len(out1["thread_candidates"]),
            "deterministic": True,
            "semantic_projection_matches": True,
        }

    gold = load(MV_ROOT / "preview" / "2026-10-08" / "65922_ota_values_expression.json")
    request = request_from_artifact(gold)
    payload = approved_artifact_to_fixture_payload(gold)

    # Thread display readiness is adapter-owned.
    topic = payload["thread_candidates"][0]["normalized_primary_topic"]
    natural_key = f"THEME:{request.source_resolution['confirmed_speaker']}:{topic}"
    promoted_thread = materialize_provider_payload(
        request=request,
        provider_payload=payload,
        provider_schema=PROVIDER_SCHEMA,
        artifact_schema=ARTIFACT_SCHEMA,
        extractor_version=extractor_version,
        existing_thread_counts={natural_key: 1},
    )
    assert promoted_thread["thread_candidates"][0]["formal_thread_ready"] is True

    # Evidence must be exact source text.
    bad_evidence = copy.deepcopy(payload)
    bad_evidence["meaning_units"][0]["evidence_excerpt"] += " invented"
    try:
        materialize_provider_payload(
            request=request,
            provider_payload=bad_evidence,
            provider_schema=PROVIDER_SCHEMA,
            artifact_schema=ARTIFACT_SCHEMA,
            extractor_version=extractor_version,
        )
        raise AssertionError("invented evidence was accepted")
    except ExtractionBoundaryError as exc:
        assert "exact substring" in str(exc)

    # Provider cannot invent HHA relation IDs.
    bad_relation = copy.deepcopy(payload)
    bad_relation["voice_candidates"][0]["related_songs"] = ["SNG-999999"]
    try:
        materialize_provider_payload(
            request=request,
            provider_payload=bad_relation,
            provider_schema=PROVIDER_SCHEMA,
            artifact_schema=ARTIFACT_SCHEMA,
            extractor_version=extractor_version,
            relation_context={},
        )
        raise AssertionError("unknown relation ID was accepted")
    except ExtractionBoundaryError as exc:
        assert "RELATION_CONTEXT" in str(exc)

    # Provisional anchors cannot carry permanent IDs.
    bad_anchor = copy.deepcopy(payload)
    bad_anchor["meaning_units"][1]["candidate_primary_anchor"]["object_id"] = "LIV-FAKE"
    try:
        materialize_provider_payload(
            request=request,
            provider_payload=bad_anchor,
            provider_schema=PROVIDER_SCHEMA,
            artifact_schema=ARTIFACT_SCHEMA,
            extractor_version=extractor_version,
        )
        raise AssertionError("provisional fake ID was accepted")
    except ExtractionBoundaryError as exc:
        assert "PROVISIONAL anchor" in str(exc)

    # Abstract Theme keys are blocked.
    vague = copy.deepcopy(payload)
    vague["thread_candidates"][0]["normalized_primary_topic"] = "成長"
    try:
        materialize_provider_payload(
            request=request,
            provider_payload=vague,
            provider_schema=PROVIDER_SCHEMA,
            artifact_schema=ARTIFACT_SCHEMA,
            extractor_version=extractor_version,
        )
        raise AssertionError("vague Theme was accepted")
    except ExtractionBoundaryError as exc:
        assert "too abstract" in str(exc)

    print(json.dumps({
        "extractor_version_is_prompt_and_schema_bound": True,
        "wire_schema_is_provider_compatible_projection": True,
        "approved_fixture_materialization": results,
        "thread_formalization_adapter_owned": True,
        "invented_evidence": "BLOCKED",
        "invented_hha_relation_id": "BLOCKED",
        "provisional_fake_id": "BLOCKED",
        "vague_theme": "BLOCKED",
        "voice_id_allocated": False,
        "notion_write": False,
        "result": "PASS"
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
