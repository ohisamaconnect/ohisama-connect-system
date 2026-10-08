#!/usr/bin/env python3
"""Static contract audit for Apps Script Calibration provider eval runner."""

from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / "apps-script" / "member_voices" / "MEMBER_VOICES_Provider_Eval_Current.gs"
PENDING = ROOT / "member_voices" / "eval" / "CALIBRATION_10_MANIFEST.pending.json"

text = RUNNER.read_text(encoding="utf-8")
pending = json.loads(PENDING.read_text(encoding="utf-8"))

required = [
    "gemini-3.8-flash",
    "thinking_level",
    "GEMINI_API_KEY",
    "MEMBER_VOICES_CALIBRATION_MANIFEST_FILE_ID",
    "manifest.status !== 'READY'",
    "manifest.cases.length !== 10",
    "VOICE-20261007-18",
    "v1beta/interactions",
    "response_format",
    "store: false",
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

assert pending["status"] == "PENDING_RECOVERY"
assert pending["cases"] == []
assert pending["approved_delta"] == "VOICE-20261007-18"

print(json.dumps({
    "runner_contract": "PASS",
    "requires_ready_exact_10_manifest": True,
    "uses_existing_gemini_script_property": True,
    "notion_write_surface_present": False,
    "production_sqlite_surface_present": False,
    "permanent_voice_id_target_present": False,
    "pending_manifest_does_not_authorize_execution": True,
}, ensure_ascii=False, indent=2))
