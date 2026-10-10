#!/usr/bin/env python3
"""Isolation-only REVIEW Sidecar v0.1 DRAFT validator.

Does not call Gemini, production adapters, GitHub, Notion or SQLite.
Reads JSON inputs and prints an audit. No writes. Optional article-map verifies
source excerpts against locally available article.txt bytes.
Requires: jsonschema>=4.20
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from jsonschema import Draft202012Validator

RELATION_TYPES = {
    "related_members": "MEMBER", "related_songs": "SONG",
    "related_lives": "LIVE", "related_events": "EVENT",
    "related_releases": "RELEASE",
}
CORE_PATTERN = re.compile(r"^([0-9]+)-C[1-9][0-9]*$")


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(ledger: dict, schema: dict, decision: dict, packet: dict,
             source_manifest: dict, source_texts: dict[str, str] | None = None,
             *, strict_complete=True) -> dict:
    errors = [str(error) for error in Draft202012Validator(schema).iter_errors(ledger)]
    if errors:
        raise ValueError("Draft Schema validation failed: " + "; ".join(errors[:5]))
    if decision.get("decision_status") != "APPROVED_NONPRODUCTION_EVALUATION_HYPOTHESIS_ONLY":
        raise ValueError("Owner sandbox decision not approved")
    if decision.get("decision_id") != ledger["owner_decision_id"]:
        raise ValueError("Owner decision ID mismatch")
    if ledger["production_write_authorized"] or ledger["status"] != "EVALUATION_ONLY_NO_PROMOTION":
        raise ValueError("Production boundary broken")

    packet_by_id = {c["article_id"]: c for c in packet["cases"]}
    manifest_by_id = {c["article_id"]: c for c in source_manifest["records"]}
    if set(manifest_by_id) != set(decision["subject_case_ids"]):
        raise ValueError("Source manifest scope differs from Owner authorization")
    allowed_cores = set(decision["sandbox_approved_core_ids"])
    observed_cores: set[str] = set()
    seen_sources: set[str] = set()
    exact_checks = 0

    for group in ledger["groups"]:
        source = group["source"]
        article_id = source["article_id"]
        if article_id not in packet_by_id or article_id not in manifest_by_id or article_id in seen_sources:
            raise ValueError("Unapproved or duplicate article: " + article_id)
        seen_sources.add(article_id)
        packet_case = packet_by_id[article_id]
        if source != manifest_by_id[article_id]:
            raise ValueError("Source identity mismatch with immutable manifest")
        if packet_case["source_text_drive_file_id"] != source["article_text_drive_file_id"]:
            raise ValueError("Wrong Drive source")
        if packet_case["article_id"] != article_id:
            raise ValueError("Cross-article mismatch")
        expected_core = {p["provisional_core_id"]: p for p in packet_case["proposed_cores"]}
        seen_refs: set[str] = set()
        for n, record in enumerate(group["reviews"], 1):
            ref = record["local_review_ref"]
            if ref in seen_refs or ref != f"R{n}":
                raise ValueError("Duplicate/out-of-order local ref: " + ref)
            seen_refs.add(ref)
            core = record["provisional_core_id"]
            m = CORE_PATTERN.fullmatch(core)
            if m is None or m.group(1) != article_id or core not in expected_core or core not in allowed_cores:
                raise ValueError("Foreign/unapproved core: " + core)
            if core in observed_cores:
                raise ValueError("Duplicate core: " + core)
            observed_cores.add(core)
            origin = expected_core[core]
            if set(record["source_origins"]) != set(origin["source_origins"]):
                raise ValueError("Gold / Preview lineage changed: " + core)
            if record["semantic_theme"] != origin["semantic_theme"]:
                raise ValueError("Unadjudicated semantic substitution: " + core)
            if record["evidence_excerpt"] != origin["exact_excerpt_for_crosscheck"]:
                raise ValueError("Evidence changed: " + core)
            if set(record["source_origins"]) != set(origin["source_origins"]):
                raise ValueError("Gold/Preview lineage mismatch: " + core)
            if record["article_body_scope_verification"] != "UNVERIFIED_NEEDS_BOUNDARY_CHECK":
                raise ValueError("Unverified Article body scope may not be declared verified")
            if "REFERENCE_CONFLICT" not in record["risk_flags"]:
                raise ValueError("Reference conflict prematurely removed")
            if article_id == "65922" and "SOURCE_SCOPE" not in record["risk_flags"]:
                raise ValueError("Known source-scope risk prematurely removed")
            if record["disposition"] != "REVIEW" or record["voice_eligible"] or record["owner_promotion_status"] != "NOT_AUTHORIZED":
                raise ValueError("Unexpected promotion: " + core)
            for field, kind in RELATION_TYPES.items():
                allowed = group["relation_context"].get(kind, {})
                if any(value not in allowed for value in record["relations"][field]):
                    raise ValueError("Unapproved relation ID in " + field)
            if source_texts is not None:
                if article_id not in source_texts or record["evidence_excerpt"] not in source_texts[article_id]:
                    raise ValueError("Missing exact ARTICLE_TEXT evidence: " + core)
                exact_checks += 1

    if strict_complete and (observed_cores != allowed_cores or len(seen_sources) != len(decision["subject_case_ids"])):
        raise ValueError("Incomplete approved sandbox scope")
    # These identifiers cannot appear anywhere in the sidecar, including untyped extensions.
    serialized = json.dumps(ledger, ensure_ascii=False)
    if re.search(r"VOC-[0-9]{6}|\"voice_id\"\s*:|\"notion_page_id\"\s*:|\"sqlite_id\"\s*:", serialized, re.I):
        raise ValueError("Permanent ID or database key in sidecar")
    return {
        "result": "PASS", "type": "NONPRODUCTION_REVIEW_ONLY",
        "groups": len(seen_sources), "review_records": len(observed_cores),
        "exact_article_excerpts_checked": exact_checks,
        "strict_complete": strict_complete, "production_writes": 0,
        "gold_writes": 0, "new_calibration_calls": 0,
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--ledger", type=Path, required=True)
    p.add_argument("--schema", type=Path, required=True)
    p.add_argument("--decision", type=Path, required=True)
    p.add_argument("--packet", type=Path, required=True)
    p.add_argument("--identity-manifest", type=Path, required=True)
    p.add_argument("--source-map", type=Path)
    p.add_argument("--allow-partial", action="store_true")
    args = p.parse_args()
    source_texts = None
    if args.source_map:
        paths = load(args.source_map)
        source_texts = {k: Path(v).read_text(encoding="utf-8") for k, v in paths.items()}
    result = validate(load(args.ledger), load(args.schema), load(args.decision),
                      load(args.packet), load(args.identity_manifest), source_texts,
                      strict_complete=not args.allow_partial)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
