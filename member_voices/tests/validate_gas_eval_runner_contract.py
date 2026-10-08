#!/usr/bin/env python3
"""Static contract audit for Apps Script Calibration provider eval runner v0.2."""

from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / "apps-script" / "member_voices" / "MEMBER_VOICES_Provider_Eval_Current.gs"
RUNTIME_RUNNER = ROOT / "apps-script" / "runtime" / "MEMBER_VOICES_Provider_Eval_Current.gs"
READY = ROOT / "member_voices" / "eval" / "CALIBRATION_10_MANIFEST.ready.json"

text = RUNNER.read_text(encoding="utf-8")
runtime_text = RUNTIME_RUNNER.read_text(encoding="utf-8")
assert runtime_text == text, "clasp runtime mirror differs from MEMBER VOICES evaluator source"
ready = json.loads(READY.read_text(encoding="utf-8"))

required = [
    "VERSION: '0.2.0'",
    "gemini-3.8-flash",
    "thinking_level",
    "GEMINI_API_KEY",
    "MANIFEST_PINNED_URL",
    "a1e60999da8342ee7aa00569be304d5d78842708",
    "manifest.manifest_version !== '0.2'",
    "manifest.cases.length !== 10",
    "VOICE-20261007-18",
    "v1beta/interactions",
    "response_format",
    "store:false",
    "RECOVERED_APPROVED_CORE",
    "Recovered gold SHA256 mismatch",
    "evidence_excerpt is not exact ARTICLE_TEXT",
    "CANONICAL anchor ID is outside RELATION_CONTEXT",
    "DRIVE_EVAL_EVIDENCE_ONLY",
    "one invocation processes at most one article",
]
for token in required:
    assert token in text, f"missing runner contract token: {token}"

for forbidden in [
    "NOTION_TOKEN",
    "api.notion.com",
    "member_voices_production.sqlite",
    "VOC-000008",
]:
    assert forbidden not in text, f"forbidden production mutation token present: {forbidden}"

expected_ids = {
    "25481", "26676", "33683", "35133", "65922",
    "67706", "50967", "55209", "25939", "44109",
}
assert ready["manifest_version"] == "0.2"
assert ready["status"] == "READY"
assert ready["approved_delta"] == "VOICE-20261007-18"
assert len(ready["cases"]) == 10
assert {str(x["article_id"]) for x in ready["cases"]} == expected_ids
assert ready["gold_bundle"]["gold_type"] == "RECOVERED_APPROVED_CORE"
assert ready["gold_bundle"]["full_artifact_v1_1_recovered"] is False

print(json.dumps({
    "runner_contract": "PASS",
    "requires_exact_recovered_calibration_10": True,
    "uses_existing_gemini_script_property": True,
    "commit_pinned_manifest_default": True,
    "gold_bundle_sha256_required": True,
    "local_semantic_invariants_present": True,
    "notion_write_surface_present": False,
    "production_sqlite_surface_present": False,
    "permanent_voice_id_target_present": False,
    "clasp_runtime_mirror_matches_source": True,
}, ensure_ascii=False, indent=2))
