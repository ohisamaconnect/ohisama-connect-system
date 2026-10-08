#!/usr/bin/env python3
"""Evaluate MEMBER VOICES Calibration runs against recovered approved core gold.

This evaluator is intentionally narrower than provider_eval.py.

It MUST NOT treat unrecovered Artifact v1.1 fields as historical gold.
It scores only preserved Calibration facts:
- exact original case coverage;
- runtime semantic invariant pass;
- accepted VOICE count;
- zero-VOICE safety;
- boundary-case review routing;
- three-run VOICE-count stability.

Semantic-core meaning alignment remains a human audit.
The full 60-article Production Eval Contract is unchanged.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping


def load(path: Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def provider_payload(record: Mapping[str, Any]) -> Mapping[str, Any]:
    value = record.get("provider_payload")
    if not isinstance(value, Mapping):
        raise ValueError("runner record is missing provider_payload")
    return value


def accepted_count(record: Mapping[str, Any]) -> int:
    payload = provider_payload(record)
    return sum(
        1 for x in payload.get("voice_candidates", [])
        if x.get("candidate_decision") == "ACCEPT"
    )


def predicted_semantic_core(record: Mapping[str, Any]) -> list[dict[str, Any]]:
    out = []
    for vc in provider_payload(record).get("voice_candidates", []):
        if vc.get("candidate_decision") != "ACCEPT":
            continue
        out.append({
            "candidate_ref": vc.get("candidate_ref"),
            "title": vc.get("title"),
            "summary": vc.get("summary"),
            "meaning_unit_refs": list(vc.get("meaning_unit_refs", [])),
        })
    return out


def evaluate_single_pass(
    gold_bundle: Mapping[str, Any],
    records: list[Mapping[str, Any]],
) -> dict[str, Any]:
    gold_cases = {
        str(x["article_id"]): x for x in gold_bundle.get("cases", [])
    }
    by_article: dict[str, Mapping[str, Any]] = {}
    duplicates: list[str] = []
    unexpected: list[str] = []

    for record in records:
        article_id = str(record.get("article_id") or "")
        if article_id not in gold_cases:
            unexpected.append(article_id)
            continue
        if article_id in by_article:
            duplicates.append(article_id)
            continue
        by_article[article_id] = record

    per_case = []
    exact_count = 0
    within_one = 0
    zero_voice_false_positive = 0
    runtime_pass = 0
    boundary_review_cases = []

    for article_id, gold in gold_cases.items():
        record = by_article.get(article_id)
        expected = int(gold["expected_voice_count"])
        if record is None:
            per_case.append({
                "article_id": article_id,
                "expected_accepted_voice_count": expected,
                "record_present": False,
            })
            continue

        pred = accepted_count(record)
        exact = pred == expected
        within = abs(pred - expected) <= 1
        invariant_ok = record.get("runtime_invariants_pass") is True
        boundary = bool(gold.get("borderline_candidates"))

        exact_count += int(exact)
        within_one += int(within)
        runtime_pass += int(invariant_ok)
        if expected == 0 and pred > 0:
            zero_voice_false_positive += 1
        if boundary:
            boundary_review_cases.append(article_id)

        per_case.append({
            "article_id": article_id,
            "expected_accepted_voice_count": expected,
            "predicted_accepted_voice_count": pred,
            "exact_voice_count": exact,
            "within_one_voice": within,
            "runtime_invariants_pass": invariant_ok,
            "runtime_invariant_errors": record.get("runtime_invariant_errors", []),
            "boundary_human_review_required": boundary,
            "gold_semantic_core": gold.get("voices", []),
            "predicted_semantic_core": predicted_semantic_core(record),
        })

    n = max(1, len(gold_cases))
    covered = len(by_article)
    metrics = {
        "case_coverage_count": covered,
        "case_coverage_rate": covered / n,
        "duplicate_record_count": len(duplicates),
        "unexpected_record_count": len(unexpected),
        "runtime_invariants_pass_rate": runtime_pass / n,
        "exact_article_voice_count_rate": exact_count / n,
        "within_one_article_voice_count_rate": within_one / n,
        "zero_voice_false_positive_accept_count": zero_voice_false_positive,
        "boundary_human_review_case_count": len(boundary_review_cases),
        "semantic_core_human_audit_required_count": covered,
    }
    automatic_gate = (
        metrics["case_coverage_count"] == 10
        and metrics["duplicate_record_count"] == 0
        and metrics["unexpected_record_count"] == 0
        and metrics["runtime_invariants_pass_rate"] == 1.0
        and metrics["zero_voice_false_positive_accept_count"] == 0
        and metrics["exact_article_voice_count_rate"] >= 0.9
        and metrics["within_one_article_voice_count_rate"] >= 0.98
    )
    return {
        "evaluation_scope": "RECOVERED_APPROVED_CORE_ONLY",
        "automatic_metrics": metrics,
        "automatic_gate_pass": automatic_gate,
        "human_gate_required": True,
        "human_gate_requirements": {
            "semantic_core_alignment": "Review every covered case against recovered Calibration wording.",
            "boundary_case_handling": boundary_review_cases,
            "unsupported_critical_summary_claim_count": 0,
        },
        "per_case": per_case,
        "duplicates": duplicates,
        "unexpected": unexpected,
        "note": (
            "Automatic gate is not Production approval. Category/Anchor/Thread/"
            "Comparison metrics are intentionally excluded because full Artifact "
            "v1.1 Calibration gold was not recovered."
        ),
    }


def evaluate_stability(
    gold_bundle: Mapping[str, Any],
    passes: list[list[Mapping[str, Any]]],
) -> dict[str, Any]:
    if len(passes) != 3:
        raise ValueError("stability evaluation requires exactly three passes")

    expected_ids = [str(x["article_id"]) for x in gold_bundle.get("cases", [])]
    pass_maps = []
    for records in passes:
        mapping = {}
        for record in records:
            article_id = str(record.get("article_id") or "")
            if article_id in expected_ids and article_id not in mapping:
                mapping[article_id] = record
        pass_maps.append(mapping)

    equal_count = 0
    zero_stable = True
    details = []
    zero_ids = {
        str(x["article_id"])
        for x in gold_bundle.get("cases", [])
        if int(x["expected_voice_count"]) == 0
    }

    for article_id in expected_ids:
        counts = [
            accepted_count(m[article_id]) if article_id in m else None
            for m in pass_maps
        ]
        all_equal = None not in counts and len(set(counts)) == 1
        equal_count += int(all_equal)
        if article_id in zero_ids and counts != [0, 0, 0]:
            zero_stable = False
        details.append({
            "article_id": article_id,
            "accepted_voice_counts": counts,
            "all_runs_equal": all_equal,
        })

    rate = equal_count / max(1, len(expected_ids))
    return {
        "article_voice_count_all_runs_equal_rate": rate,
        "zero_voice_case_stability": int(zero_stable),
        "pass": rate >= 0.9 and zero_stable,
        "details": details,
        "note": (
            "Primary Anchor / EXPLICIT_CHANGE stability is not scored from "
            "recovered Calibration gold because those full historical fields "
            "were not recovered."
        ),
    }


def load_records(directory: Path) -> list[dict[str, Any]]:
    return [
        load(path) for path in sorted(Path(directory).glob("*_provider.json"))
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gold", required=True)
    parser.add_argument("--pass-dir", action="append", required=True)
    args = parser.parse_args()

    gold = load(Path(args.gold))
    pass_dirs = [Path(x) for x in args.pass_dir]
    if len(pass_dirs) not in {1, 3}:
        raise SystemExit("Use one --pass-dir for a pass audit or exactly three for stability.")

    reports = [
        evaluate_single_pass(gold, load_records(path))
        for path in pass_dirs
    ]
    out: dict[str, Any] = {"pass_reports": reports}
    if len(pass_dirs) == 3:
        out["stability"] = evaluate_stability(
            gold, [load_records(path) for path in pass_dirs]
        )

    print(json.dumps(out, ensure_ascii=False, indent=2))
    automatic_ok = all(x["automatic_gate_pass"] for x in reports)
    stability_ok = out.get("stability", {}).get("pass", True)
    return 0 if automatic_ok and stability_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
