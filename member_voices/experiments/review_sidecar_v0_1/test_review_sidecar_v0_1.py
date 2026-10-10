#!/usr/bin/env python3
"""Deterministic, synthetic negative/positive regression for isolated REVIEW ledger.

Runs no API, no Runner, no Production mutation, no new Calibration.
Execute from repo root:
  python member_voices/experiments/review_sidecar_v0_1/test_review_sidecar_v0_1.py
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

from validate_review_sidecar_v0_1 import validate

MV = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
read = lambda p: json.loads(p.read_text(encoding="utf-8"))

LEDGER = read(HERE / "SANDBOX_THREE_CASE_LEDGER_20261011.DRAFT.json")
SCHEMA = read(HERE / "review_sidecar_v0_1.DRAFT.schema.json")
DECISION = read(MV / "eval/CAL10_OWNER_SEMANTIC_SANDBOX_DECISION_20261011.json")
PACKET = read(MV / "eval/CAL10_REFERENCE_ADJUDICATION_PACKET_2026-10-11.DRAFT.json")
IDENTITY = read(HERE / "THREE_CASE_SOURCE_IDENTITY_MANIFEST_20261011.DRAFT.json")


def run(data, *, strict=True):
    return validate(data, SCHEMA, DECISION, PACKET, IDENTITY, strict_complete=strict)


def main():
    seen = []
    def case(name, edit=None, *, should_pass=False, strict=True):
        data = copy.deepcopy(LEDGER)
        if edit:
            edit(data)
        try:
            result = run(data, strict=strict)
            success, detail = True, f"accepted {result['review_records']} reviews"
        except (ValueError, KeyError, TypeError) as exc:
            success, detail = False, f"rejected {type(exc).__name__}"
        assert success == should_pass, f"{name}: {detail}, expected pass={should_pass}"
        seen.append({"name": name, "pass": True, "expected_behavior": "ACCEPT" if should_pass else "REJECT"})

    case("approved_nine_sandbox_cores", should_pass=True)
    case("zero_review_allowed_in_partial_scope", lambda x: x["groups"].clear(), should_pass=True, strict=False)
    case("zero_review_rejected_in_strict_approval_scope", lambda x: x["groups"].clear())
    case("missing_core_rejected", lambda x: x["groups"][0]["reviews"].pop())
    case("duplicate_group_rejected", lambda x: x["groups"].append(copy.deepcopy(x["groups"][0])))
    case("unrecognized_source_rejected", lambda x: x["groups"][0]["source"].__setitem__("article_id", "99999"))
    case("source_drive_id_tamper", lambda x: x["groups"][0]["source"].__setitem__("article_text_drive_file_id", "OTHER"))
    case("source_sha_tamper", lambda x: x["groups"][0]["source"].__setitem__("article_text_sha256", "0"*64))
    case("source_speaker_tamper", lambda x: x["groups"][0]["source"].__setitem__("confirmed_speaker", "other"))
    case("source_ref_tamper", lambda x: x["groups"][0]["source"].__setitem__("source_ref_key", "src_"+ "1"*24))
    case("owner_decision_tamper", lambda x: x.__setitem__("owner_decision_id", "UNAPPROVED"))
    case("production_write_block", lambda x: x.__setitem__("production_write_authorized", True))
    case("REVIEW_cannot_become_ACCEPT", lambda x: x["groups"][0]["reviews"][0].__setitem__("disposition", "ACCEPT"))
    case("REVIEW_cannot_be_voice_eligible", lambda x: x["groups"][0]["reviews"][0].__setitem__("voice_eligible", True))
    case("REVIEW_no_promotion", lambda x: x["groups"][0]["reviews"][0].__setitem__("owner_promotion_status", "APPROVED"))
    case("REVIEW_no_permanent_ID_key", lambda x: x["groups"][0]["reviews"][0].__setitem__("voice_id", "VOC-000008"))
    case("REVIEW_no_permanent_ID_in_body", lambda x: x["groups"][0]["reviews"][0].__setitem__("review_reason", "VOC-000008"))
    case("evidence_text_not_swappable", lambda x: x["groups"][0]["reviews"][0].__setitem__("evidence_excerpt", "invented"))
    case("no_semantic_substitution", lambda x: x["groups"][0]["reviews"][0].__setitem__("semantic_theme", "different"))
    case("no_reference_origin_substitution", lambda x: x["groups"][2]["reviews"][0].__setitem__("source_origins", ["PREVIEW_V1"]))
    case("no_ref_conflict_suppression", lambda x: x["groups"][0]["reviews"][0].__setitem__("risk_flags", ["GRANULARITY"]))
    case("source_scope_risk_65922", lambda x: x["groups"][2]["reviews"][0].__setitem__("risk_flags", ["REFERENCE_CONFLICT"]))
    case("cannot_omit_boundary_verification", lambda x: x["groups"][0]["reviews"][0].__setitem__("article_body_scope_verification", "VERIFIED_OWNER_SOURCE"))
    case("duplicate_review_ref", lambda x: x["groups"][0]["reviews"][1].__setitem__("local_review_ref", "R1"))
    case("cross_article_core", lambda x: x["groups"][0]["reviews"][1].__setitem__("provisional_core_id", "65922-C4"))
    case("relation_label_blocked", lambda x: x["groups"][0]["reviews"][0]["relations"]["related_songs"].append("曲名だけ"))
    def valid_relation(data):
        data["groups"][0]["relation_context"]["SONG"] = {"SNG-010": "Allowed Song"}
        data["groups"][0]["reviews"][0]["relations"]["related_songs"] = ["SNG-010"]
    case("typed_allowed_canonical_relation", valid_relation, should_pass=True)
    def untyped_relation(data):
        data["groups"][0]["relation_context"]["LIVE"] = {"SNG-010": "wrong type"}
        data["groups"][0]["reviews"][0]["relations"]["related_songs"] = ["SNG-010"]
    case("typed_allowlist_enforced", untyped_relation)
    print(json.dumps({"suite": "ISOLATED_REVIEW_SIDECAR_v0.1_DRAFT", "cases": len(seen),
                      "passed": len(seen), "status": "PASS", "tests": seen}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
