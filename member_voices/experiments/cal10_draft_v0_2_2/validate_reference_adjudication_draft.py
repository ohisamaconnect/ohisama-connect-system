#!/usr/bin/env python3
"""Nonproduction owner-adjudication packet checker. Does not change any oracle.

Usage:
  python member_voices/experiments/cal10_draft_v0_2_2/validate_reference_adjudication_draft.py \
    --packet member_voices/eval/CAL10_REFERENCE_ADJUDICATION_PACKET_2026-10-11.DRAFT.json
  Optionally supply --source-map path/to/private-source-map.json, where JSON maps
  article IDs to LOCAL article.txt paths, to check excerpts byte-for-byte against
  archive text. Do not commit private article.txt source copies into GitHub.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

CONFLICTS = {"25481", "35133", "65922"}


def validate(packet: dict, source_texts: dict[str, str] | None = None) -> dict:
    assert packet["status"].endswith("NO_ORACLE_CHANGE")
    assert packet["unresolved"]["reference_conflicts_resolved"] == 0
    for forbidden in ("preview_deleted", "gold_edited", "production_changes", "new_calibration_calls"):
        assert packet["unresolved"][forbidden] == 0, forbidden
    case_ids = {c["article_id"] for c in packet["cases"]}
    assert case_ids == CONFLICTS and len(packet["cases"]) == 3
    checked = 0
    article_checks = 0
    for case in packet["cases"]:
        assert case["gold_accepted_count"] != case["preview_accepted_count"]
        assert case["owner_adjudication"] is None
        cores = case["proposed_cores"]
        assert len(cores) == case["provisional_distinct_core_count"]
        ids = {x["provisional_core_id"] for x in cores}
        assert len(ids) == len(cores)
        assert len(case["crosswalk"]) == len(cores)
        assert {x["proposal"] for x in case["crosswalk"]} == ids
        for x in cores:
            assert x["provisional_decision"] == "REVIEW_FOR_OWNER"
            assert x["owner_decision"] is None
            assert x["exact_excerpt_for_crosscheck"]
            assert x["source_origins"]
            checked += 1
            if source_texts is not None:
                assert x["exact_excerpt_for_crosscheck"] in source_texts[case["article_id"]], (case["article_id"],x["provisional_core_id"])
                article_checks += 1
    return {"result": "PASS", "cases": 3, "provisional_cores": checked,
            "article_evidence_exact_checks": article_checks,
            "source_texts_supplied": source_texts is not None,
            "owner_decisions_modified": 0, "gold_mutations": 0, "production_calls": 0}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--packet", type=Path, required=True)
    p.add_argument("--source-map", type=Path)
    args = p.parse_args()
    packet = json.loads(args.packet.read_text(encoding="utf-8"))
    sources = None
    if args.source_map:
        mapping = json.loads(args.source_map.read_text(encoding="utf-8"))
        sources = {key: Path(path).read_text(encoding="utf-8") for key,path in mapping.items()}
    print(json.dumps(validate(packet, sources), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
