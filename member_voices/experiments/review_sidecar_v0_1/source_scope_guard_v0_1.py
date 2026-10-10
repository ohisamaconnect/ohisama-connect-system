"""Standalone, read-only MEMBER VOICES source-body scope guard (DRAFT).

Article-specific signature is an explicit audited input; this does NOT discover
or certify the body boundary automatically. Never feeds active Adapter/Production.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass

class BoundaryError(ValueError):
    pass

@dataclass(frozen=True)
class Boundary:
    body: str
    excluded_tail: str
    end_codepoints: int
    signature_occurrences: int


def partition(text: str, terminal_signature: str, *, tail_navigation_markers=("記事一覧",)) -> Boundary:
    if not isinstance(text, str) or not isinstance(terminal_signature, str):
        raise BoundaryError("Input and terminal signature must be text")
    if not terminal_signature.strip() or len(terminal_signature) < 8:
        raise BoundaryError("Terminal signature is missing or too short")
    occurrences = text.count(terminal_signature)
    if occurrences != 1:
        raise BoundaryError(f"Article signoff signature is not unique ({occurrences})")
    end = text.index(terminal_signature) + len(terminal_signature)
    body, tail = text[:end], text[end:]
    if not tail.strip():
        raise BoundaryError("No excluded navigation tail to verify")
    if not tail_navigation_markers or not any(x and x in tail for x in tail_navigation_markers):
        raise BoundaryError("No independently visible navigation indicator after signoff")
    return Boundary(body, tail, end, occurrences)


def audit_provider(payload: dict, part: Boundary) -> dict:
    """Compute diagnostic gate without mutating payload or allocating VOICE IDs."""
    results = {}
    for mu in payload.get("meaning_units", []):
        ref, excerpt = mu.get("unit_ref"), mu.get("evidence_excerpt")
        if not isinstance(ref, str) or not ref or ref in results:
            raise BoundaryError("Missing/duplicate provider Meaning Unit ref")
        if not isinstance(excerpt, str) or not excerpt.strip():
            category = "MISSING_EVIDENCE"
        elif excerpt in part.excluded_tail:
            category = "SOURCE_SCOPE_CONTAMINATION"
        elif excerpt not in part.body:
            category = "UNMATCHED_EVIDENCE"
        elif part.body.count(excerpt) != 1:
            category = "AMBIGUOUS_EVIDENCE"
        else:
            category = "ARTICLE_BODY_EXACT_EVIDENCE"
        results[ref] = category
    candidates = []
    for vc in payload.get("voice_candidates", []):
        refs = vc.get("meaning_unit_refs", [])
        if not isinstance(refs, list) or not refs:
            raise BoundaryError("Candidate has no Meaning Unit refs")
        statuses = [results.get(ref, "UNKNOWN_UNIT_REF") for ref in refs]
        accepted = vc.get("candidate_decision") == "ACCEPT"
        candidates.append({
            "candidate_ref": vc.get("candidate_ref"),
            "candidate_was_accepted": accepted,
            "meaning_unit_refs": refs,
            "scope_status": "BLOCK_FOR_REVIEW" if any(v != "ARTICLE_BODY_EXACT_EVIDENCE" for v in statuses) else "ARTICLE_BODY_EXACT_EVIDENCE",
            "nonbody_refs": [ref for ref, v in zip(refs, statuses) if v != "ARTICLE_BODY_EXACT_EVIDENCE"],
        })
    return {
        "status": "NONPRODUCTION_DIAGNOSTIC_ONLY",
        "meaning_unit_count": len(results),
        "meaning_unit_results": results,
        "accepted_candidates_with_nonbody_evidence": [x["candidate_ref"] for x in candidates if x["candidate_was_accepted"] and x["scope_status"] == "BLOCK_FOR_REVIEW"],
        "candidates": candidates,
        "boundary_end_unicode_codepoints": part.end_codepoints,
        "excluded_tail_codepoints": len(part.excluded_tail),
        "production_mutations": 0,
    }


def inspect_article(article_text: str, terminal_signature: str, provider_payload: dict) -> dict:
    return audit_provider(provider_payload, partition(article_text, terminal_signature))
