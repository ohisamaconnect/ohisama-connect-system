#!/usr/bin/env python3
"""Provider-neutral semantic extraction boundary for MEMBER VOICES.

This module does not implement a specific LLM/provider.
It defines the immutable request, provider protocol, artifact assembly,
JSON Schema validation, and semantic safety invariants.

Flow:
  fresh Source Resolver PASS
    -> build_request(article bytes; verify text hash)
    -> provider.extract(request) returns semantic payload only
    -> adapter injects immutable source + source_resolution
    -> JSON Schema Draft 2020-12 validation
    -> attribution / source-returnability invariants
    -> validated extraction artifact

No permanent Voice_ID is allocated here.
No Notion write is performed here.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol

from jsonschema import Draft202012Validator


SCHEMA_VERSION = "1.1"
CONTRACT_VERSION = "1.0"


class ExtractionBoundaryError(ValueError):
    pass


def _norm(value: Any) -> str:
    if value is None:
        return ""
    s = unicodedata.normalize("NFKC", str(value))
    return re.sub(r"\s+", "", s)


@dataclass(frozen=True)
class ExtractionRequest:
    run_id: str
    source: Mapping[str, Any]
    source_resolution: Mapping[str, Any]
    article_text: str
    article_sha256: str


class SemanticExtractorProvider(Protocol):
    """Provider-neutral interface.

    Implementations may use OpenAI, Gemini, a local model, or another provider.
    They MUST return semantic fields only and MUST NOT author source identity.
    """

    provider_name: str
    extractor_version: str

    def extract(self, request: ExtractionRequest) -> Mapping[str, Any]:
        ...


def canonicalize_source(source: Mapping[str, Any]) -> dict[str, Any]:
    out = dict(source)
    native = dict(out.get("native_locator") or {})
    local_dir = native.get("local_dir")
    if local_dir:
        out["archive_reference"] = local_dir
        out["text_reference"] = f"{local_dir.rstrip('/')}/article.txt"
    out["processing_status"] = "PROCESSED"
    return out


def build_request(
    *,
    run_id: str,
    resolver_artifact: Mapping[str, Any],
    article_bytes: bytes,
) -> ExtractionRequest:
    if not run_id:
        raise ExtractionBoundaryError("run_id is required")

    resolution = dict(resolver_artifact.get("source_resolution") or {})
    source = dict(resolver_artifact.get("source") or {})

    if resolution.get("gate_status") != "PASS":
        raise ExtractionBoundaryError("Source Resolver must PASS before semantic extraction")
    if resolution.get("speaker_confirmed") is not True:
        raise ExtractionBoundaryError("speaker_confirmed must be true")
    if not resolution.get("confirmed_speaker"):
        raise ExtractionBoundaryError("confirmed_speaker is required")
    if not source:
        raise ExtractionBoundaryError("resolved source is required")

    actual_hash = hashlib.sha256(article_bytes).hexdigest()
    expected_hash = source.get("text_hash") or (source.get("native_locator") or {}).get("text_hash")
    if expected_hash and actual_hash != expected_hash:
        raise ExtractionBoundaryError(
            f"article.txt SHA256 mismatch: expected={expected_hash} actual={actual_hash}"
        )

    try:
        article_text = article_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ExtractionBoundaryError(f"article.txt must be UTF-8: {exc}") from exc

    source = canonicalize_source(source)
    return ExtractionRequest(
        run_id=run_id,
        source=source,
        source_resolution=resolution,
        article_text=article_text,
        article_sha256=actual_hash,
    )


def _validate_schema(artifact: Mapping[str, Any], schema: Mapping[str, Any]) -> None:
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(artifact), key=lambda e: list(e.absolute_path))
    if errors:
        first = errors[0]
        path = "/".join(str(p) for p in first.absolute_path)
        raise ExtractionBoundaryError(f"JSON Schema validation failed at {path or '<root>'}: {first.message}")


def _validate_semantic_invariants(artifact: Mapping[str, Any]) -> None:
    source = artifact["source"]
    resolution = artifact["source_resolution"]
    confirmed = resolution["confirmed_speaker"]
    native_id = source.get("source_native_id")
    text_reference = source.get("text_reference")

    mu_ids = {m["meaning_unit_id"] for m in artifact["meaning_units"]}
    vc_ids = {c["candidate_key"] for c in artifact["voice_candidates"]}

    def validate_speaker(kind: str, value: str) -> None:
        if _norm(value) != _norm(confirmed):
            raise ExtractionBoundaryError(
                f"{kind} Speaker mismatch: confirmed={confirmed!r}, output={value!r}"
            )

    def validate_locator(kind: str, locator: Mapping[str, Any]) -> None:
        if str(locator.get("article_id") or "") != str(native_id or ""):
            raise ExtractionBoundaryError(
                f"{kind} source locator Article_ID mismatch: "
                f"expected={native_id!r}, output={locator.get('article_id')!r}"
            )
        if locator.get("text_reference") != text_reference:
            raise ExtractionBoundaryError(
                f"{kind} text_reference mismatch: "
                f"expected={text_reference!r}, output={locator.get('text_reference')!r}"
            )

    for mu in artifact["meaning_units"]:
        validate_speaker("Meaning Unit", mu["speaker"])
        validate_locator("Meaning Unit", mu["source_locator"])

    for vc in artifact["voice_candidates"]:
        validate_speaker("VOICE Candidate", vc["speaker"])
        validate_locator("VOICE Candidate", vc["source_locator"])
        missing = [x for x in vc["meaning_unit_references"] if x not in mu_ids]
        if missing:
            raise ExtractionBoundaryError(
                f"VOICE Candidate references unknown Meaning Units: {missing}"
            )

    for thread in artifact["thread_candidates"]:
        validate_speaker("Thread Candidate", thread["speaker"])
        missing = [x for x in thread["voice_candidate_keys"] if x not in vc_ids]
        if missing:
            raise ExtractionBoundaryError(
                f"Thread Candidate references unknown VOICE Candidates: {missing}"
            )

    for comp in artifact["comparison_candidates"]:
        if comp["prior_candidate_key"] not in vc_ids or comp["current_candidate_key"] not in vc_ids:
            raise ExtractionBoundaryError(
                "Comparison Candidate must reference VOICE Candidates in the same artifact"
            )


def extract_and_validate(
    *,
    provider: SemanticExtractorProvider,
    request: ExtractionRequest,
    schema: Mapping[str, Any],
) -> dict[str, Any]:
    payload = dict(provider.extract(request))

    allowed = {
        "meaning_units",
        "voice_candidates",
        "thread_candidates",
        "comparison_candidates",
        "warnings",
    }
    unexpected = sorted(set(payload) - allowed)
    if unexpected:
        raise ExtractionBoundaryError(
            f"Provider returned forbidden top-level fields: {unexpected}. "
            "Source identity is adapter-owned."
        )

    for key in allowed:
        if key not in payload:
            raise ExtractionBoundaryError(f"Provider payload missing required field: {key}")

    artifact = {
        "schema_version": SCHEMA_VERSION,
        "contract_version": CONTRACT_VERSION,
        "extractor_version": provider.extractor_version,
        "run_id": request.run_id,
        "source": dict(request.source),
        "source_resolution": dict(request.source_resolution),
        "meaning_units": payload["meaning_units"],
        "voice_candidates": payload["voice_candidates"],
        "thread_candidates": payload["thread_candidates"],
        "comparison_candidates": payload["comparison_candidates"],
        "warnings": payload["warnings"],
    }

    _validate_schema(artifact, schema)
    _validate_semantic_invariants(artifact)
    return artifact


class ApprovedArtifactFixtureProvider:
    """Preview/test provider only.

    It returns semantic arrays from an already-approved extraction artifact.
    This is deliberately NOT a production semantic extractor.
    """

    provider_name = "approved-artifact-fixture"

    def __init__(self, artifact: Mapping[str, Any], extractor_version: str = "fixture-preview-v0.1"):
        self._artifact = dict(artifact)
        self.extractor_version = extractor_version

    def extract(self, request: ExtractionRequest) -> Mapping[str, Any]:
        return {
            "meaning_units": self._artifact.get("meaning_units", []),
            "voice_candidates": self._artifact.get("voice_candidates", []),
            "thread_candidates": self._artifact.get("thread_candidates", []),
            "comparison_candidates": self._artifact.get("comparison_candidates", []),
            "warnings": self._artifact.get("warnings", []),
        }


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))
