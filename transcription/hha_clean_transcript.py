#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OC-OS HHA + OC grounded Transcript Cleanup v0.2.0

Input:
  *_TRANSCRIPT.json produced by the coverage-first transcription pipeline.

Output:
  *_CLEAN_HHA.txt
  *_HHA_CORRECTION_REPORT.txt
  *_HHA_CORRECTIONS.json

Principles:
- Never modify the machine evidence in TRANSCRIPT.json.
- Automatic replacement is allowed ONLY for an explicit alias.
- HHA canonical terms and OC-OS domain terms are separate sources.
- No fuzzy matching is used in the operational cleanup path.
- A surname-only utterance must remain surname-only unless an explicit alias
  proves it was an ASR error.
- Conjunctions, modifiers, and ordinary spoken context around a name are part
  of the utterance and must be preserved.
- Music-boundary repair is allowed ONLY for an explicit confirmed rule.
- No semantic summarization, paraphrasing, completion, or invention.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

VERSION = "0.2.0"


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


def hha_targets(terms: dict) -> dict[str, dict]:
    targets: dict[str, dict] = {}

    for item in terms.get("members", []):
        display = compact_member_name(item["name"])
        targets[display] = {"kind": "member", "id": item.get("id"), "source": "HHA"}

    for item in terms.get("songs", []):
        display = item["title"]
        targets[display] = {"kind": "song", "id": item.get("id"), "source": "HHA"}

    for item in terms.get("fixed_terms", []):
        targets[item] = {"kind": "fixed", "id": None, "source": "HHA"}

    return targets


def add_oc_targets(targets: dict[str, dict], oc_terms: dict) -> dict[str, dict]:
    combined = dict(targets)
    for item in oc_terms.get("fixed_terms", []):
        # If the same canonical term already exists in HHA, HHA remains authoritative.
        combined.setdefault(item, {"kind": "oc", "id": None, "source": "OC-OS"})
    return combined


def validate_aliases(
    term_sets: list[tuple[str, dict]],
    targets: dict[str, dict],
) -> list[dict]:
    aliases = []
    errors = []

    for source_name, terms in term_sets:
        for raw in terms.get("aliases", []):
            source = str(raw.get("from", "")).strip()
            target = str(raw.get("to", "")).strip()
            if not source or not target:
                errors.append(f"empty alias in {source_name}: {raw}")
                continue

            if target not in targets:
                errors.append(
                    f"alias target is not canonical in {source_name}: {source} -> {target}"
                )
                continue

            canonical_meta = targets[target]
            declared_kind = raw.get("kind")
            # OC aliases may intentionally target an HHA member/song/fixed term.
            if declared_kind and declared_kind not in {
                canonical_meta["kind"],
                "oc",
            }:
                errors.append(
                    f"alias kind mismatch in {source_name}: {source} -> {target} "
                    f"declared={declared_kind} canonical={canonical_meta['kind']}"
                )
                continue

            aliases.append({
                "from": source,
                "to": target,
                "kind": canonical_meta["kind"],
                "target_id": raw.get("target_id", canonical_meta.get("id")),
                "term_source": source_name,
            })

    if errors:
        raise RuntimeError("Invalid transcription alias files:\n- " + "\n- ".join(errors))

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


def apply_boundary_repairs(
    segments: list[dict],
    rules: list[dict],
) -> tuple[list[dict], list[dict]]:
    """
    Repair only explicitly confirmed split patterns across a large music gap.
    No fuzzy or linguistic guessing is performed here.
    """
    working = [dict(seg) for seg in segments]
    repair_log: list[dict] = []

    i = 0
    while i < len(working) - 1:
        left = working[i]
        right = working[i + 1]
        matched = False

        for rule in rules:
            expected_left = str(rule.get("left", ""))
            right_prefix = str(rule.get("right_prefix", ""))
            if left.get("text", "") != expected_left:
                continue
            if not str(right.get("text", "")).startswith(right_prefix):
                continue

            before_left = left.get("text", "")
            before_right = right.get("text", "")
            replacement_left = str(rule.get("replacement_left", ""))
            replacement_right_prefix = str(
                rule.get("replacement_right_prefix", right_prefix)
            )

            left["text"] = replacement_left
            right["text"] = replacement_right_prefix + before_right[len(right_prefix):]

            repair_log.append({
                "left_start": float(left["start"]),
                "left_end": float(left["end"]),
                "right_start": float(right["start"]),
                "right_end": float(right["end"]),
                "before_left": before_left,
                "before_right": before_right,
                "after_left": replacement_left,
                "after_right": right["text"],
                "reason": rule.get("reason", "explicit boundary repair"),
            })
            matched = True
            break

        if matched and not str(left.get("text", "")).strip():
            working.pop(i)
            # right moved into position i; continue from same index.
            continue

        i += 1

    return working, repair_log


def write_clean(path: Path, segments: list[dict]) -> None:
    lines = []
    for seg in segments:
        text = str(seg.get("text", "")).strip()
        if not text:
            continue
        lines.append(
            f"[{format_clock(seg['start'])} --> {format_clock(seg['end'])}] {text}"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="OC-OS HHA + OC grounded Transcript Cleanup v0.2.0"
    )
    parser.add_argument("transcript_json", type=Path)
    parser.add_argument(
        "--terms",
        type=Path,
        default=None,
        help="Default: hha_transcription_terms.json beside this script",
    )
    parser.add_argument(
        "--oc-terms",
        type=Path,
        default=None,
        help="Default: oc_transcription_terms.json beside this script",
    )
    args = parser.parse_args()

    transcript_path = args.transcript_json.expanduser().resolve()
    if not transcript_path.exists():
        raise FileNotFoundError(transcript_path)

    script_dir = Path(__file__).resolve().parent
    hha_terms_path = (
        args.terms.expanduser().resolve()
        if args.terms
        else script_dir / "hha_transcription_terms.json"
    )
    oc_terms_path = (
        args.oc_terms.expanduser().resolve()
        if args.oc_terms
        else script_dir / "oc_transcription_terms.json"
    )

    for required in (hha_terms_path, oc_terms_path):
        if not required.exists():
            raise FileNotFoundError(required)

    transcript = load_json(transcript_path)
    hha_terms = load_json(hha_terms_path)
    oc_terms = load_json(oc_terms_path)

    targets = add_oc_targets(hha_targets(hha_terms), oc_terms)
    aliases = validate_aliases(
        [("HHA", hha_terms), ("OC-OS", oc_terms)],
        targets,
    )

    source_segments = transcript.get("clean_segments") or transcript.get("raw_segments") or []
    if not source_segments:
        raise RuntimeError("TRANSCRIPT.json has no clean_segments/raw_segments")

    aliased_segments = []
    applied_log = []

    for seg in source_segments:
        original = str(seg.get("text", ""))
        corrected, applied = apply_aliases(original, aliases)

        out_seg = {
            "start": float(seg["start"]),
            "end": float(seg["end"]),
            "text": corrected,
        }
        aliased_segments.append(out_seg)

        if applied:
            applied_log.append({
                "start": out_seg["start"],
                "end": out_seg["end"],
                "before": original,
                "after": corrected,
                "replacements": applied,
            })

    output_segments, boundary_log = apply_boundary_repairs(
        aliased_segments,
        oc_terms.get("boundary_repairs", []),
    )

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
        "OC-OS HHA + OC GROUNDED TRANSCRIPT CORRECTION REPORT",
        f"version: {VERSION}",
        f"HHA terms: {hha_terms_path}",
        f"OC terms : {oc_terms_path}",
        "policy: explicit aliases and explicit boundary repairs only; fuzzy matching disabled",
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
                    f"[{replacement['kind']}/{replacement['term_source']}] "
                    f"x{replacement['count']}"
                )
            report_lines.append("")

    report_lines.extend(["", "[Music-boundary repairs: explicit rules only]"])
    if not boundary_log:
        report_lines.append("none")
    else:
        for item in boundary_log:
            report_lines.append(
                f"LEFT  {format_clock(item['left_start'])} --> {format_clock(item['left_end'])}: "
                f"{item['before_left']}"
            )
            report_lines.append(
                f"RIGHT {format_clock(item['right_start'])} --> {format_clock(item['right_end'])}: "
                f"{item['before_right']}"
            )
            report_lines.append(f"AFTER : {item['after_right']}")
            report_lines.append(f"REASON: {item['reason']}")
            report_lines.append("")

    report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    corrections_payload = {
        "pipeline": "OC-OS HHA + OC grounded Transcript Cleanup",
        "version": VERSION,
        "source_transcript": str(transcript_path),
        "hha_terms_file": str(hha_terms_path),
        "oc_terms_file": str(oc_terms_path),
        "policy": {
            "automatic_replacement_requires_explicit_alias": True,
            "boundary_repair_requires_explicit_rule": True,
            "fuzzy_matching_enabled": False,
            "preserve_surname_only_utterances": True,
            "preserve_spoken_context_around_names": True,
        },
        "automatic_replacements": applied_log,
        "boundary_repairs": boundary_log,
        "output_segments": output_segments,
    }
    corrections_path.write_text(
        json.dumps(corrections_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("HHA + OC grounded cleanup complete")
    print(f"automatic replacement segments: {len(applied_log)}")
    print(f"music-boundary repairs         : {len(boundary_log)}")
    print("fuzzy suggestions              : disabled")
    print(f"CLEAN_HHA : {clean_path}")
    print(f"REPORT    : {report_path}")
    print(f"JSON      : {corrections_path}")

    print("\n----- HHA + OC CLEAN PREVIEW -----")
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
