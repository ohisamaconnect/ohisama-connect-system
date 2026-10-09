#!/usr/bin/env python3
"""MEMBER VOICES semantic provider contract v0.1.

This module sits between a production LLM provider and the already-fixed
Extraction Artifact Schema v1.1.

Provider responsibilities:
- semantic segmentation and interpretation only;
- exact evidence excerpts copied from article text;
- local references (U1/V1/T1/C1), never machine/permanent IDs.

Adapter responsibilities:
- Source/Speaker identity;
- article hash verification (upstream semantic_extractor.py);
- relation ID allow-listing;
- deterministic machine keys;
- source locators;
- thread formalization state;
- final Artifact Schema v1.1 validation.

No Voice_ID allocation and no Notion write happen here.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Mapping

from jsonschema import Draft202012Validator

from semantic_extractor import ExtractionBoundaryError, ExtractionRequest


PROVIDER_SCHEMA_VERSION = "0.1"
PROMPT_VERSION = "0.1"

RELATION_FIELDS = {
    "related_members": "MEMBER",
    "related_songs": "SONG",
    "related_lives": "LIVE",
    "related_events": "EVENT",
    "related_releases": "RELEASE",
}

VAGUE_THEME_TOPICS = {
    "夢",
    "成長",
    "努力",
    "感情",
    "活動",
    "頑張る",
    "がんばる",
}


@dataclass(frozen=True)
class ProviderConfig:
    provider_name: str
    model_id: str
    thinking_level: str
    provider_schema_version: str = PROVIDER_SCHEMA_VERSION
    prompt_version: str = PROMPT_VERSION

    def extractor_version(self, *, prompt_text: str, provider_schema: Mapping[str, Any]) -> str:
        prompt_hash = hashlib.sha256(prompt_text.encode("utf-8")).hexdigest()[:12]
        schema_hash = hashlib.sha256(_canonical_json(provider_schema).encode("utf-8")).hexdigest()[:12]
        model_slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", self.model_id)
        provider_slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", self.provider_name)
        return (
            f"mv-semantic-p{self.prompt_version}"
            f"-ps{self.provider_schema_version}"
            f"-{provider_slug}-{model_slug}-{self.thinking_level}"
            f"-ph{prompt_hash}-sh{schema_hash}"
        )


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash_key(prefix: str, payload: Mapping[str, Any]) -> str:
    digest = hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()[:24]
    return f"{prefix}{digest}"


def _norm_text(value: Any) -> str:
    if value is None:
        return ""
    text = unicodedata.normalize("NFKC", str(value))
    return re.sub(r"\s+", " ", text).strip()


def _norm_topic(value: str) -> str:
    return _norm_text(value)


def validate_provider_payload(
    payload: Mapping[str, Any],
    *,
    provider_schema: Mapping[str, Any],
) -> None:
    validator = Draft202012Validator(provider_schema)
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.absolute_path))
    if errors:
        first = errors[0]
        path = "/".join(str(p) for p in first.absolute_path)
        raise ExtractionBoundaryError(
            f"Provider payload schema failed at {path or '<root>'}: {first.message}"
        )


def build_provider_input(
    request: ExtractionRequest,
    *,
    relation_context: Mapping[str, Mapping[str, str]] | None = None,
    comparison_context: list[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build the provider-facing input envelope.

    ARTICLE_TEXT is untrusted source data. Speaker identity is already fixed by
    Source Resolver and cannot be changed by the provider.
    """

    source_title = request.source.get("source_title") or request.source.get("title")
    return {
        "confirmed_speaker": request.source_resolution["confirmed_speaker"],
        "source_title": source_title,
        "published_at": request.source.get("published_at"),
        "spoken_at": request.source.get("spoken_at"),
        "relation_context": dict(relation_context or {}),
        "comparison_context": list(comparison_context or []),
        "article_text": request.article_text,
    }


def _validate_exact_excerpt(excerpt: str, article_text: str, *, label: str) -> None:
    if excerpt not in article_text:
        raise ExtractionBoundaryError(
            f"{label} evidence_excerpt is not an exact substring of ARTICLE_TEXT"
        )


def _validate_anchor(
    anchor: Mapping[str, Any] | None,
    *,
    article_text: str,
    relation_context: Mapping[str, Mapping[str, str]],
) -> dict[str, Any] | None:
    if anchor is None:
        return None

    out = dict(anchor)
    for evidence in out.get("evidence", []):
        if evidence not in article_text:
            raise ExtractionBoundaryError(
                "Primary Anchor evidence must be copied from ARTICLE_TEXT"
            )

    status = out.get("status")
    object_id = out.get("object_id")
    object_type = str(out.get("object_type") or "")

    if status == "PROVISIONAL":
        if object_id is not None:
            raise ExtractionBoundaryError(
                "PROVISIONAL anchor must not contain a permanent object_id"
            )
        return {
            "status": "PROVISIONAL",
            "object_system": None,
            "object_type": object_type,
            "object_id": None,
            "label": out["label"],
            "evidence": list(out.get("evidence", [])),
        }

    if status != "CANONICAL":
        raise ExtractionBoundaryError(f"Unsupported anchor status: {status!r}")
    if not object_id:
        raise ExtractionBoundaryError("CANONICAL anchor requires object_id")

    allowed = relation_context.get(object_type, {})
    if object_id not in allowed:
        raise ExtractionBoundaryError(
            f"Canonical anchor ID {object_id!r} is not present in RELATION_CONTEXT[{object_type!r}]"
        )

    return {
        "status": "CANONICAL",
        "object_system": "HHA",
        "object_type": object_type,
        "object_id": object_id,
        "label": out["label"],
        "evidence": list(out.get("evidence", [])),
    }


def _validate_relation_ids(
    candidate: Mapping[str, Any],
    *,
    relation_context: Mapping[str, Mapping[str, str]],
) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for field, object_type in RELATION_FIELDS.items():
        ids = list(candidate.get(field, []))
        allowed = relation_context.get(object_type, {})
        unknown = [value for value in ids if value not in allowed]
        if unknown:
            raise ExtractionBoundaryError(
                f"{field} contains IDs absent from RELATION_CONTEXT[{object_type!r}]: {unknown}"
            )
        result[field] = ids
    return result


def materialize_provider_payload(
    *,
    request: ExtractionRequest,
    provider_payload: Mapping[str, Any],
    provider_schema: Mapping[str, Any],
    artifact_schema: Mapping[str, Any],
    extractor_version: str,
    relation_context: Mapping[str, Mapping[str, str]] | None = None,
    existing_thread_counts: Mapping[str, int] | None = None,
) -> dict[str, Any]:
    """Convert local provider refs into a full Extraction Artifact v1.1."""

    validate_provider_payload(provider_payload, provider_schema=provider_schema)

    relation_context = dict(relation_context or {})
    existing_thread_counts = dict(existing_thread_counts or {})

    confirmed_speaker = request.source_resolution["confirmed_speaker"]
    source_ref_key = request.source["source_ref_key"]
    source_native_id = request.source.get("source_native_id")
    text_reference = request.source["text_reference"]

    units_by_local: dict[str, dict[str, Any]] = {}
    meaning_units: list[dict[str, Any]] = []

    for raw in provider_payload["meaning_units"]:
        local_ref = raw["unit_ref"]
        if local_ref in units_by_local:
            raise ExtractionBoundaryError(f"Duplicate provider unit_ref: {local_ref}")

        excerpt = raw["evidence_excerpt"]
        _validate_exact_excerpt(excerpt, request.article_text, label=local_ref)

        locator = {
            "locator_type": "PERSONAL_BLOG_ARCHIVE_TEXT",
            "article_id": str(source_native_id),
            "text_reference": text_reference,
            "start_marker": raw.get("start_marker"),
            "end_marker": raw.get("end_marker"),
            "excerpt": excerpt,
        }
        anchor = _validate_anchor(
            raw.get("candidate_primary_anchor"),
            article_text=request.article_text,
            relation_context=relation_context,
        )
        mu_id = _hash_key(
            "mu_",
            {
                "source_ref_key": source_ref_key,
                "extractor_version": extractor_version,
                "source_locator": locator,
                "central_proposition": _norm_text(raw["central_proposition"]),
            },
        )
        unit = {
            "meaning_unit_id": mu_id,
            "speaker": confirmed_speaker,
            "source_locator": locator,
            "central_proposition": raw["central_proposition"],
            "unit_type": raw.get("unit_type"),
            "referenced_period": raw.get("referenced_period"),
            "candidate_categories": list(raw.get("candidate_categories", [])),
            "candidate_primary_topic": raw.get("candidate_primary_topic"),
            "candidate_secondary_topics": list(raw.get("candidate_secondary_topics", [])),
            "candidate_relations": list(raw.get("candidate_relations", [])),
            "candidate_primary_anchor": anchor,
            "knowledge_value": raw.get("knowledge_value"),
            "voice_eligible": bool(raw["voice_eligible"]),
            "decision_reason": raw["decision_reason"],
        }
        units_by_local[local_ref] = unit
        meaning_units.append(unit)

    candidates_by_local: dict[str, dict[str, Any]] = {}
    voice_candidates: list[dict[str, Any]] = []

    for raw in provider_payload["voice_candidates"]:
        local_ref = raw["candidate_ref"]
        if local_ref in candidates_by_local:
            raise ExtractionBoundaryError(f"Duplicate provider candidate_ref: {local_ref}")

        local_mu_refs = list(raw["meaning_unit_refs"])
        missing = [ref for ref in local_mu_refs if ref not in units_by_local]
        if missing:
            raise ExtractionBoundaryError(
                f"{local_ref} references unknown provider Meaning Units: {missing}"
            )
        if not any(units_by_local[ref]["voice_eligible"] for ref in local_mu_refs):
            raise ExtractionBoundaryError(
                f"{local_ref} has no voice_eligible Meaning Unit"
            )

        mu_refs = [units_by_local[ref]["meaning_unit_id"] for ref in local_mu_refs]
        first_locator = dict(units_by_local[local_mu_refs[0]]["source_locator"])
        anchor = _validate_anchor(
            raw.get("primary_anchor"),
            article_text=request.article_text,
            relation_context=relation_context,
        )
        related = _validate_relation_ids(raw, relation_context=relation_context)

        candidate_proposition = (
            raw.get("summary")
            or raw.get("title")
            or raw.get("primary_topic")
            or local_ref
        )
        candidate_key = _hash_key(
            "vc_",
            {
                "source_ref_key": source_ref_key,
                "meaning_unit_references": mu_refs,
                "candidate_proposition": _norm_text(candidate_proposition),
            },
        )
        candidate = {
            "candidate_key": candidate_key,
            "meaning_unit_references": mu_refs,
            "speaker": confirmed_speaker,
            "title": raw.get("title"),
            "summary": raw.get("summary"),
            "source_locator": first_locator,
            "published_at": request.source.get("published_at"),
            "spoken_at": request.source.get("spoken_at"),
            "referenced_period": raw.get("referenced_period"),
            "temporal_perspective": raw.get("temporal_perspective"),
            "topic_categories": list(raw.get("topic_categories", [])),
            "primary_topic": raw.get("primary_topic"),
            "secondary_topics": list(raw.get("secondary_topics", [])),
            "primary_anchor": anchor,
            **related,
            "knowledge_value": raw.get("knowledge_value"),
            "attribution": raw.get("attribution"),
            "candidate_decision": raw["candidate_decision"],
            "decision_reason": raw["decision_reason"],
        }
        candidates_by_local[local_ref] = candidate
        voice_candidates.append(candidate)

    threads_by_local: dict[str, dict[str, Any]] = {}
    thread_candidates: list[dict[str, Any]] = []

    for raw in provider_payload["thread_candidates"]:
        local_ref = raw["thread_ref"]
        if local_ref in threads_by_local:
            raise ExtractionBoundaryError(f"Duplicate provider thread_ref: {local_ref}")

        local_candidate_refs = list(raw["voice_candidate_refs"])
        missing = [ref for ref in local_candidate_refs if ref not in candidates_by_local]
        if missing:
            raise ExtractionBoundaryError(
                f"{local_ref} references unknown provider VOICE Candidates: {missing}"
            )
        candidate_keys = [candidates_by_local[ref]["candidate_key"] for ref in local_candidate_refs]

        thread_type = raw["thread_type"]
        if thread_type == "THEME":
            topic = _norm_topic(raw.get("normalized_primary_topic") or "")
            if not topic:
                raise ExtractionBoundaryError("THEME thread requires normalized_primary_topic")
            if topic in VAGUE_THEME_TOPICS:
                raise ExtractionBoundaryError(
                    f"THEME topic is too abstract for automatic threading: {topic!r}"
                )
            if raw.get("anchor") is not None:
                raise ExtractionBoundaryError("THEME thread must not contain anchor")
            natural_key = f"THEME:{confirmed_speaker}:{topic}"
            anchor = None
            prefix = "thr_t_"
        elif thread_type == "ANCHOR":
            if raw.get("normalized_primary_topic") is not None:
                raise ExtractionBoundaryError(
                    "ANCHOR thread must not contain normalized_primary_topic"
                )
            anchor = _validate_anchor(
                raw.get("anchor"),
                article_text=request.article_text,
                relation_context=relation_context,
            )
            if not anchor or anchor["status"] != "CANONICAL" or not anchor.get("object_id"):
                raise ExtractionBoundaryError(
                    "ANCHOR thread requires a CANONICAL anchor with an allow-listed object_id"
                )
            natural_key = f"ANCHOR:{confirmed_speaker}:{anchor['object_id']}"
            topic = None
            prefix = "thr_a_"
        else:
            raise ExtractionBoundaryError(f"Unsupported thread_type: {thread_type!r}")

        thread_key = _hash_key(prefix, {"natural_key": natural_key})
        existing = int(existing_thread_counts.get(natural_key, 0))
        formal_ready = existing + len(candidate_keys) >= 2

        thread = {
            "thread_key": thread_key,
            "thread_type": thread_type,
            "natural_key": natural_key,
            "speaker": confirmed_speaker,
            "anchor": anchor,
            "normalized_primary_topic": topic,
            "voice_candidate_keys": candidate_keys,
            "formal_thread_ready": formal_ready,
            "decision_reason": raw["decision_reason"],
        }
        threads_by_local[local_ref] = thread
        thread_candidates.append(thread)

    comparison_candidates: list[dict[str, Any]] = []
    seen_comparison_refs: set[str] = set()

    for raw in provider_payload["comparison_candidates"]:
        local_ref = raw["comparison_ref"]
        if local_ref in seen_comparison_refs:
            raise ExtractionBoundaryError(f"Duplicate provider comparison_ref: {local_ref}")
        seen_comparison_refs.add(local_ref)

        prior_ref = raw["prior_candidate_ref"]
        current_ref = raw["current_candidate_ref"]
        if prior_ref not in candidates_by_local or current_ref not in candidates_by_local:
            raise ExtractionBoundaryError(
                f"{local_ref} comparison refs must point to candidates in the same extraction artifact"
            )

        thread_ref = raw.get("thread_ref")
        thread_key = None
        if thread_ref is not None:
            if thread_ref not in threads_by_local:
                raise ExtractionBoundaryError(
                    f"{local_ref} references unknown provider thread_ref: {thread_ref}"
                )
            thread_key = threads_by_local[thread_ref]["thread_key"]

        relation = raw["relation_to_prior"]
        explicit = bool(raw["explicit_change_claimed"])
        if relation == "EXPLICIT_CHANGE" and not explicit:
            raise ExtractionBoundaryError(
                "EXPLICIT_CHANGE requires explicit_change_claimed=true"
            )
        if explicit and relation != "EXPLICIT_CHANGE":
            raise ExtractionBoundaryError(
                "explicit_change_claimed=true is reserved for EXPLICIT_CHANGE"
            )

        for evidence in raw.get("evidence", []):
            if evidence not in request.article_text:
                raise ExtractionBoundaryError(
                    f"{local_ref} comparison evidence is not an exact substring of ARTICLE_TEXT"
                )

        prior_key = candidates_by_local[prior_ref]["candidate_key"]
        current_key = candidates_by_local[current_ref]["candidate_key"]
        comparison_key = _hash_key(
            "cmp_",
            {
                "thread_key": thread_key,
                "prior_candidate_key": prior_key,
                "current_candidate_key": current_key,
            },
        )
        comparison_candidates.append(
            {
                "comparison_candidate_key": comparison_key,
                "thread_key": thread_key,
                "prior_candidate_key": prior_key,
                "current_candidate_key": current_key,
                "relation_to_prior": relation,
                "difference_summary": raw["difference_summary"],
                "explicit_change_claimed": explicit,
                "comparison_confidence": raw["comparison_confidence"],
                "evidence": list(raw.get("evidence", [])),
            }
        )

    artifact = {
        "schema_version": "1.1",
        "contract_version": "1.0",
        "extractor_version": extractor_version,
        "run_id": request.run_id,
        "source": dict(request.source),
        "source_resolution": dict(request.source_resolution),
        "meaning_units": meaning_units,
        "voice_candidates": voice_candidates,
        "thread_candidates": thread_candidates,
        "comparison_candidates": comparison_candidates,
        "warnings": list(provider_payload.get("warnings", [])),
    }

    validator = Draft202012Validator(artifact_schema)
    errors = sorted(validator.iter_errors(artifact), key=lambda e: list(e.absolute_path))
    if errors:
        first = errors[0]
        path = "/".join(str(p) for p in first.absolute_path)
        raise ExtractionBoundaryError(
            f"Materialized Artifact Schema v1.1 failed at {path or '<root>'}: {first.message}"
        )

    return artifact


def approved_artifact_to_fixture_payload(artifact: Mapping[str, Any]) -> dict[str, Any]:
    """Convert an approved Artifact v1.1 into provider-local refs for dry-run tests.

    This helper is test-only. It does not infer new semantics.
    """

    mu_map: dict[str, str] = {}
    units: list[dict[str, Any]] = []
    for index, mu in enumerate(artifact.get("meaning_units", []), start=1):
        local = f"U{index}"
        mu_map[mu["meaning_unit_id"]] = local
        loc = mu["source_locator"]
        anchor = mu.get("candidate_primary_anchor")
        if anchor is not None:
            anchor = {
                "status": anchor["status"],
                "object_type": anchor["object_type"],
                "object_id": anchor.get("object_id"),
                "label": anchor["label"],
                "evidence": list(anchor.get("evidence", [])),
            }
        units.append(
            {
                "unit_ref": local,
                "evidence_excerpt": loc.get("excerpt") or "",
                "start_marker": loc.get("start_marker"),
                "end_marker": loc.get("end_marker"),
                "central_proposition": mu["central_proposition"],
                "unit_type": mu.get("unit_type"),
                "referenced_period": _period_object(mu.get("referenced_period")),
                "candidate_categories": list(mu.get("candidate_categories", [])),
                "candidate_primary_topic": mu.get("candidate_primary_topic"),
                "candidate_secondary_topics": list(mu.get("candidate_secondary_topics", [])),
                "candidate_relations": list(mu.get("candidate_relations", [])),
                "candidate_primary_anchor": anchor,
                "knowledge_value": mu.get("knowledge_value"),
                "voice_eligible": bool(mu["voice_eligible"]),
                "decision_reason": mu["decision_reason"],
            }
        )

    vc_map: dict[str, str] = {}
    candidates: list[dict[str, Any]] = []
    for index, vc in enumerate(artifact.get("voice_candidates", []), start=1):
        local = f"V{index}"
        vc_map[vc["candidate_key"]] = local
        anchor = vc.get("primary_anchor")
        if anchor is not None:
            anchor = {
                "status": anchor["status"],
                "object_type": anchor["object_type"],
                "object_id": anchor.get("object_id"),
                "label": anchor["label"],
                "evidence": list(anchor.get("evidence", [])),
            }
        candidates.append(
            {
                "candidate_ref": local,
                "meaning_unit_refs": [mu_map[x] for x in vc["meaning_unit_references"]],
                "title": vc.get("title"),
                "summary": vc.get("summary"),
                "referenced_period": _period_object(vc.get("referenced_period")),
                "temporal_perspective": vc.get("temporal_perspective"),
                "topic_categories": list(vc.get("topic_categories", [])),
                "primary_topic": vc.get("primary_topic"),
                "secondary_topics": list(vc.get("secondary_topics", [])),
                "primary_anchor": anchor,
                "related_members": list(vc.get("related_members", [])),
                "related_songs": list(vc.get("related_songs", [])),
                "related_lives": list(vc.get("related_lives", [])),
                "related_events": list(vc.get("related_events", [])),
                "related_releases": list(vc.get("related_releases", [])),
                "knowledge_value": vc.get("knowledge_value"),
                "attribution": vc.get("attribution"),
                "candidate_decision": vc["candidate_decision"],
                "decision_reason": vc["decision_reason"],
            }
        )

    thread_map: dict[str, str] = {}
    threads: list[dict[str, Any]] = []
    for index, thread in enumerate(artifact.get("thread_candidates", []), start=1):
        local = f"T{index}"
        thread_map[thread["thread_key"]] = local
        anchor = thread.get("anchor")
        if anchor is not None:
            anchor = {
                "status": anchor["status"],
                "object_type": anchor["object_type"],
                "object_id": anchor.get("object_id"),
                "label": anchor["label"],
                "evidence": list(anchor.get("evidence", [])),
            }
        threads.append(
            {
                "thread_ref": local,
                "thread_type": thread["thread_type"],
                "anchor": anchor,
                "normalized_primary_topic": thread.get("normalized_primary_topic"),
                "voice_candidate_refs": [vc_map[x] for x in thread["voice_candidate_keys"]],
                "decision_reason": thread["decision_reason"],
            }
        )

    comparisons: list[dict[str, Any]] = []
    for index, comp in enumerate(artifact.get("comparison_candidates", []), start=1):
        comparisons.append(
            {
                "comparison_ref": f"C{index}",
                "thread_ref": thread_map.get(comp.get("thread_key")),
                "prior_candidate_ref": vc_map[comp["prior_candidate_key"]],
                "current_candidate_ref": vc_map[comp["current_candidate_key"]],
                "relation_to_prior": comp["relation_to_prior"],
                "difference_summary": comp["difference_summary"],
                "explicit_change_claimed": bool(comp["explicit_change_claimed"]),
                "comparison_confidence": comp["comparison_confidence"],
                "evidence": list(comp.get("evidence", [])),
            }
        )

    return {
        "meaning_units": units,
        "voice_candidates": candidates,
        "thread_candidates": threads,
        "comparison_candidates": comparisons,
        "warnings": list(artifact.get("warnings", [])),
    }


def _period_object(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if isinstance(value, Mapping):
        return {
            "start": value.get("start"),
            "end": value.get("end"),
            "label": value.get("label"),
        }
    return {"start": None, "end": None, "label": str(value)}
