#!/usr/bin/env python3
"""Validate recovered Calibration 10 durable evaluation assets."""

from pathlib import Path
import hashlib
import json

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
EVAL = ROOT / "member_voices" / "eval"
BUNDLE = EVAL / "CALIBRATION_10_RECOVERED_GOLD_v0.1.json"
MANIFEST = EVAL / "CALIBRATION_10_MANIFEST.ready.json"
SCHEMA = EVAL / "calibration_manifest_v0_2.schema.json"
FULL_CONTRACT = EVAL / "SEMANTIC_PROVIDER_EVAL_CONTRACT_v0.1.json"
RECOVERED_CONTRACT = EVAL / "CALIBRATION_RECOVERED_EVAL_CONTRACT_v0.1.json"

bundle_bytes = BUNDLE.read_bytes()
bundle = json.loads(bundle_bytes.decode("utf-8"))
manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
full_contract = json.loads(FULL_CONTRACT.read_text(encoding="utf-8"))
recovered_contract = json.loads(RECOVERED_CONTRACT.read_text(encoding="utf-8"))

errors = sorted(
    Draft202012Validator(schema).iter_errors(manifest),
    key=lambda e: list(e.absolute_path),
)
assert not errors, errors[0].message if errors else ""

expected_ids = [
    "25481", "26676", "33683", "35133", "65922",
    "67706", "50967", "55209", "25939", "44109",
]
assert [str(x["article_id"]) for x in manifest["cases"]] == expected_ids
assert [str(x["article_id"]) for x in bundle["cases"]] == expected_ids

actual_bundle_sha = hashlib.sha256(bundle_bytes).hexdigest()
assert actual_bundle_sha == manifest["gold_bundle"]["sha256"]
assert actual_bundle_sha == "029b95ea134ecee0e63adc137cd744a064902eab2e7b888bd683510312464682"

bundle_by_id = {str(x["article_id"]): x for x in bundle["cases"]}
for case in manifest["cases"]:
    gold = bundle_by_id[str(case["gold_case_key"])]
    assert case["expected_speaker"] == gold["author"]
    assert case["article_sha256"] == gold["article_text_sha256"]
    assert case["expected_accepted_voice_count"] == gold["expected_voice_count"]
    assert case["gold_status"] == "RECOVERED_APPROVED_CORE"

boundary_ids = [
    str(x["article_id"])
    for x in manifest["cases"]
    if x["boundary_review_expected"]
]
assert boundary_ids == ["50967"]
assert len(bundle_by_id["50967"].get("borderline_candidates", [])) == 1

assert bundle["full_artifact_v1_1_recovered"] is False
assert manifest["gold_bundle"]["full_artifact_v1_1_recovered"] is False

excluded = set(recovered_contract["excluded_from_scoring"])
assert {
    "topic_category_f1",
    "primary_anchor_precision",
    "primary_anchor_recall",
    "thread_membership_recall",
    "comparison_relation_accuracy",
}.issubset(excluded)

# The full 60-article Production contract is preserved, not weakened.
assert full_contract["quality_gates"]["accepted_voice_recall"]["threshold"] == 0.95
assert full_contract["quality_gates"]["accepted_voice_precision"]["threshold"] == 0.95
assert full_contract["quality_gates"]["topic_category_f1"]["threshold"] == 0.9
assert full_contract["production_pass_rule"].startswith("ALL safety gates pass")

print(json.dumps({
    "calibration_recovery_assets": "PASS",
    "manifest_schema": "PASS",
    "case_count": 10,
    "article_ids": expected_ids,
    "bundle_sha256": actual_bundle_sha,
    "boundary_case": "50967",
    "full_artifact_v1_1_recovered": False,
    "full_production_contract_unchanged": True,
}, ensure_ascii=False, indent=2))
