#!/usr/bin/env python3
"""NON-PRODUCTION semantic contract regression harness, v0.2.2 DRAFT.

Manual core_key labels are fixture/auditor annotations, not NLP inference.
Does not invoke Gemini, SQLite, Notion, archive crawlers, or production adapters.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

FIELDS = {"related_members": "MEMBER", "related_songs": "SONG", "related_lives": "LIVE", "related_events": "EVENT", "related_releases": "RELEASE"}
STATES = {"ACCEPT", "REVIEW", "REJECT"}


def audit(payload: dict, reference: dict, article_text: str, relation_context: dict) -> dict:
    flags = set()
    units = {}
    for unit in payload.get("meaning_units", []):
        ref = unit["unit_ref"]
        if ref in units:
            flags.add("INVALID_UNIT_REFERENCE")
        units[ref] = unit
        disposition = unit.get("disposition")
        if disposition not in STATES or unit.get("voice_eligible") is not (disposition == "ACCEPT"):
            flags.add("INVALID_DISPOSITION_MAPPING")
        if unit.get("evidence_excerpt", "") not in article_text or not unit.get("evidence_excerpt"):
            flags.add("EVIDENCE_NOT_IN_ARTICLE")

    observed_cores = set()
    accepted_count = 0
    for voice in payload.get("voice_candidates", []):
        decision = voice.get("candidate_decision")
        if decision not in STATES:
            flags.add("INVALID_CANDIDATE_DECISION")
        asserted = voice.get("asserted_unit_refs", [])
        context = voice.get("context_only_refs", [])
        refs = voice.get("meaning_unit_refs", [])
        if len(refs) != len(set(refs)) or set(refs) != set(asserted) | set(context) or set(asserted) & set(context):
            flags.add("INVALID_UNIT_ROLE_PARTITION")
        if any(ref not in units for ref in refs):
            flags.add("INVALID_UNIT_REFERENCE")
            continue
        if decision == "ACCEPT":
            accepted_count += 1
            if not asserted:
                flags.add("ACCEPT_WITHOUT_ASSERTED_CORE")
            if any(units[x]["disposition"] != "ACCEPT" for x in asserted):
                flags.add("BOUNDARY_ABSORPTION")
            accepted_groups = {units[x].get("core_key") for x in asserted if units[x]["disposition"] == "ACCEPT"}
            accepted_groups.discard(None)
            if len(accepted_groups) > 1:
                flags.add("MERGE_REVIEW_REQUIRED")
            observed_cores.update(accepted_groups)
        for field, object_type in FIELDS.items():
            allowed = relation_context.get(object_type, {})
            if any(v not in allowed for v in voice.get(field, [])):
                flags.add("RELATION_ALLOWLIST_VIOLATION")
    gold = set(reference.get("gold_core_keys", []))
    missing, extra = gold - observed_cores, observed_cores - gold
    if missing:
        flags.add("MISSING_GOLD_CORE")
    if extra:
        flags.add("EXTRA_ACCEPTED_CORE")
    if missing and extra and accepted_count == len(gold):
        flags.add("COUNT_EQUAL_SEMANTIC_SUBSTITUTION")
    preview = reference.get("preview_core_keys")
    if preview is not None and set(preview) != gold:
        flags.add("REFERENCE_CONFLICT")
    if not gold and accepted_count:
        flags.add("ZERO_VOICE_FALSE_POSITIVE")
    return {"flags": sorted(flags), "missing_core_keys": sorted(missing), "extra_core_keys": sorted(extra), "accepted_voice_count": accepted_count, "human_semantic_review_required": True}


def main() -> int:
    root = Path(__file__).resolve().parent
    fixture = json.loads((root / "regression_cases_v0_2_2.json").read_text(encoding="utf-8"))
    schema = json.loads((root.parents[1] / "schemas" / "member_voices_provider_payload_v0_2_2.DRAFT.schema.json").read_text(encoding="utf-8"))
    assert "disposition" in schema["$defs"]["providerMeaningUnit"]["properties"]
    assert "asserted_unit_refs" in schema["$defs"]["providerVoiceCandidate"]["properties"]
    assert "context_only_refs" in schema["$defs"]["providerVoiceCandidate"]["properties"]
    results = []
    for case in fixture["cases"]:
        got = audit(case["payload"], case["reference"], case["article_text"], case.get("relation_context", {}))
        expected = sorted(case["expected_flags"])
        assert got["flags"] == expected, f"{case['name']}: expected={expected}, got={got['flags']}"
        assert got["accepted_voice_count"] == case["expected_accepted_count"], case["name"]
        results.append({"name": case["name"], "pass": True, "flags": got["flags"]})
    print(json.dumps({"suite": "MV-SEMANTIC-CONTRACT-v0.2.2-DRAFT", "result": "PASS", "cases": len(results), "regressions": results, "nonproduction": True}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
