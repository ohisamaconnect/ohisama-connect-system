#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OC-OS HHA-grounded Transcript Cleanup v0.1.1

Input:
  *_TRANSCRIPT.json produced by the coverage-first transcription pipeline.

Output:
  *_CLEAN_HHA.txt
  *_HHA_CORRECTION_REPORT.txt
  *_HHA_CORRECTIONS.json

Principles:
- Never modify the machine evidence in TRANSCRIPT.json.
- Automatic replacement is allowed ONLY for an explicit alias whose target is
  present in the HHA-grounded canonical term file.
- No fuzzy matching is used in the operational cleanup path.
- A surname-only utterance must remain surname-only unless an explicit alias
  proves it was an ASR error.
- Conjunctions, modifiers, and ordinary spoken context around a name are part
  of the utterance and must be preserved.
- No semantic summarization, paraphrasing, completion, or invention.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

VERSION = "0.1.1"


def format_clock(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    ms_total = int(round(seconds * 1000))
    hours, rem = divmod(ms_total, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"


def compact_member_name(name: str) -> str:
    return re.sub(r"[\s　]+", "", name)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def canonical_targets(terms: dict) -> dict[str, dict]:
    targets: dict[str, dict] = {}

    for item in terms.get("members", []):
        display = compact_member_name(item["name"])
        targets[display] = {"kind": "member", "id": item.get("id")}

    for item in terms.get("songs", []):
        display = item["title"]
        targets[display] = {"kind": "song", "id": item.get("id")}

    for item in terms.get("fixed_terms", []):
        targets[item] = {"kind": "fixed", "id": None}

    return targets


def validate_aliases(terms: dict, targets: dict[str, dict]) -> list[dict]:
    aliases = []
    errors = []

    for raw in terms.get("aliases", []):
        source = str(raw.get("from", "")).strip()
        target = str(raw.get("to", "")).strip()
        if not source or not target:
            errors.append(f"empty alias: {raw}")
            continue

        if target not in targets:
            errors.append(f"alias target is not canonical: {source} -> {target}")
            continue

        canonical_meta = targets[target]
        declared_kind = raw.get("kind")
        if declared_kind and declared_kind != canonical_meta["kind"]:
            errors.append(
                f"alias kind mismatch: {source} -> {target} "
                f"declared={declared_kind} canonical={canonical_meta['kind']}"
            )
            continue

        aliases.append({
            "from": source,
            "to": target,
            "kind": canonical_meta["kind"],
            "target_id": raw.get("target_id", canonical_meta.get("id")),
        })

    if errors:
        raise RuntimeError("Invalid HHA alias file:\n- " + "\n- ".join(errors))

    # Longest source first prevents a shorter alias from consuming a longer one.
    aliases.sort(key=lambda x: len(x["from"]), reverse=True)
    return aliases


def apply_aliases(text: str, aliases: list[dict]) -> tuple[str, list[dict]]:
    out = text
    applied: list[dict] = []

    for alias in aliases:
        source = alias["from"]
        target = alias["to"]
        count = out.count(source)
        if count <= 0:
            continue

        out = out.replace(source, target)
        applied.append({**alias, "count": count})

    return out, applied


def write_clean(path: Path, segments: list[dict]) -> None:
    lines = []
    for seg in segments:
        lines.append(
            f"[{format_clock(seg['start'])} --> {format_clock(seg['end'])}] "
            f"{seg['text'].strip()}"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="OC-OS HHA-grounded Transcript Cleanup v0.1.1"
    )
    parser.add_argument("transcript_json", type=Path)
    parser.add_argument(
        "--terms",
        type=Path,
        default=None,
        help="Default: hha_transcription_terms.json beside this script",
    )
    args = parser.parse_args()

    transcript_path = args.transcript_json.expanduser().resolve()
    if not transcript_path.exists():
        raise FileNotFoundError(transcript_path)

    script_dir = Path(__file__).resolve().parent
    terms_path = (
        args.terms.expanduser().resolve()
        if args.terms
        else script_dir / "hha_transcription_terms.json"
    )
    if not terms_path.exists():
        raise FileNotFoundError(terms_path)

    transcript = load_json(transcript_path)
    terms = load_json(terms_path)
    targets = canonical_targets(terms)
    aliases = validate_aliases(terms, targets)

    source_segments = transcript.get("clean_segments") or transcript.get("raw_segments") or []
    if not source_segments:
        raise RuntimeError("TRANSCRIPT.json has no clean_segments/raw_segments")

    output_segments = []
    applied_log = []

    for seg in source_segments:
        original = str(seg.get("text", ""))
        corrected, applied = apply_aliases(original, aliases)

        out_seg = {
            "start": float(seg["start"]),
            "end": float(seg["end"]),
            "text": corrected,
        }
        output_segments.append(out_seg)

        if applied:
            applied_log.append({
                "start": out_seg["start"],
                "end": out_seg["end"],
                "before": original,
                "after": corrected,
                "replacements": applied,
            })

    base_name = transcript_path.name
    if base_name.endswith("_TRANSCRIPT.json"):
        prefix = base_name[:-len("_TRANSCRIPT.json")]
    else:
        prefix = transcript_path.stem

    out_dir = transcript_path.parent
    clean_path = out_dir / f"{prefix}_CLEAN_HHA.txt"
    report_path = out_dir / f"{prefix}_HHA_CORRECTION_REPORT.txt"
    corrections_path = out_dir / f"{prefix}_HHA_CORRECTIONS.json"

    write_clean(clean_path, output_segments)

    report_lines = [
        "OC-OS HHA-GROUNDED TRANSCRIPT CORRECTION REPORT",
        f"version: {VERSION}",
        f"terms: {terms_path}",
        "policy: explicit aliases only; fuzzy matching disabled",
        "",
        "[Automatic replacements: explicit aliases only]",
    ]

    if not applied_log:
        report_lines.append("none")
    else:
        for item in applied_log:
            report_lines.append(
                f"{format_clock(item['start'])} --> {format_clock(item['end'])}"
            )
            report_lines.append(f"BEFORE: {item['before']}")
            report_lines.append(f"AFTER : {item['after']}")
            for replacement in item["replacements"]:
                report_lines.append(
                    f"  - {replacement['from']} -> {replacement['to']} "
                    f"[{replacement['kind']}] x{replacement['count']}"
                )
            report_lines.append("")

    report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    corrections_payload = {
        "pipeline": "OC-OS HHA-grounded Transcript Cleanup",
        "version": VERSION,
        "source_transcript": str(transcript_path),
        "terms_file": str(terms_path),
        "policy": {
            "automatic_replacement_requires_explicit_alias": True,
            "fuzzy_matching_enabled": False,
            "preserve_surname_only_utterances": True,
            "preserve_spoken_context_around_names": True,
        },
        "automatic_replacements": applied_log,
        "output_segments": output_segments,
    }
    corrections_path.write_text(
        json.dumps(corrections_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("HHA-grounded cleanup complete")
    print(f"automatic replacement segments: {len(applied_log)}")
    print("fuzzy suggestions              : disabled")
    print(f"CLEAN_HHA : {clean_path}")
    print(f"REPORT    : {report_path}")
    print(f"JSON      : {corrections_path}")

    print("\n----- HHA CLEAN PREVIEW -----")
    for seg in output_segments[:40]:
        print(
            f"[{format_clock(seg['start'])} --> {format_clock(seg['end'])}] "
            f"{seg['text']}"
        )
    if len(output_segments) > 40:
        print(f"... ({len(output_segments) - 40} more segments)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
