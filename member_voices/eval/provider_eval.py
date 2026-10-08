#!/usr/bin/env python3
"""Semantic evaluation helpers for MEMBER VOICES provider candidates.

This evaluator compares provider-produced Artifact v1.1 outputs to approved
Pilot Artifact v1.1 golds without requiring processing keys to match.

Automatic metrics are evidence- and field-based. They do NOT replace the
required human audit for unsupported summary claims or nuanced borderline cases.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable, Mapping


VAGUE_TOPICS = {"夢", "成長", "努力", "感情", "活動", "頑張る", "がんばる"}


def _norm(value: Any) -> str:
    if value is None:
        return ""
    text = unicodedata.normalize("NFKC", str(value))
    return re.sub(r"\s+", "", text)


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _accepted(artifact: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    return [
        x for x in artifact.get("voice_candidates", [])
        if x.get("candidate_decision") == "ACCEPT"
    ]


def _reviews(artifact: Mapping[str, Any]) -> int:
    return sum(
        1 for x in artifact.get("voice_candidates", [])
        if x.get("candidate_decision") == "REVIEW"
    )


def _mu_map(artifact: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    return {x["meaning_unit_id"]: x for x in artifact.get("meaning_units", [])}


def _candidate_evidence(
    artifact: Mapping[str, Any],
    candidate: Mapping[str, Any],
) -> list[str]:
    units = _mu_map(artifact)
    evidence = []
    for ref in candidate.get("meaning_unit_references", []):
        mu = units.get(ref)
        if mu:
            excerpt = (mu.get("source_locator") or {}).get("excerpt")
            if excerpt:
                evidence.append(str(excerpt))
    if not evidence:
        excerpt = (candidate.get("source_locator") or {}).get("excerpt")
        if excerpt:
            evidence.append(str(excerpt))
    return evidence


def _evidence_similarity(
    gold_artifact: Mapping[str, Any],
    gold: Mapping[str, Any],
    pred_artifact: Mapping[str, Any],
    pred: Mapping[str, Any],
) -> float:
    ga = [_norm(x) for x in _candidate_evidence(gold_artifact, gold) if _norm(x)]
    pa = [_norm(x) for x in _candidate_evidence(pred_artifact, pred) if _norm(x)]
    if not ga or not pa:
        return 0.0
    best = 0.0
    for g in ga:
        for p in pa:
            if g in p or p in g:
                score = min(len(g), len(p)) / max(len(g), len(p))
            else:
                score = SequenceMatcher(None, g, p).ratio()
            best = max(best, score)
    return best


def align_accepted_candidates(
    gold_artifact: Mapping[str, Any],
    pred_artifact: Mapping[str, Any],
    *,
    minimum_similarity: float = 0.45,
) -> list[tuple[Mapping[str, Any], Mapping[str, Any], float]]:
    gold = _accepted(gold_artifact)
    pred = _accepted(pred_artifact)
    available = set(range(len(gold)))
    matches = []

    ranked = []
    for pi, p in enumerate(pred):
        for gi, g in enumerate(gold):
            ranked.append((
                _evidence_similarity(gold_artifact, g, pred_artifact, p),
                pi,
                gi,
            ))
    ranked.sort(reverse=True)

    used_pred = set()
    for score, pi, gi in ranked:
        if score < minimum_similarity:
            break
        if pi in used_pred or gi not in available:
            continue
        used_pred.add(pi)
        available.remove(gi)
        matches.append((gold[gi], pred[pi], score))
    return matches


def _anchor_signature(candidate: Mapping[str, Any]) -> tuple[str, str, str] | None:
    anchor = candidate.get("primary_anchor")
    if not anchor:
        return None
    return (
        str(anchor.get("status") or ""),
        str(anchor.get("object_id") or ""),
        _norm(anchor.get("label")),
    )


def _f1(gold_values: Iterable[str], pred_values: Iterable[str]) -> tuple[int, int, int]:
    g = set(gold_values)
    p = set(pred_values)
    return len(g & p), len(p - g), len(g - p)


def evaluate_pair(
    gold: Mapping[str, Any],
    pred: Mapping[str, Any],
) -> dict[str, Any]:
    gold_accept = _accepted(gold)
    pred_accept = _accepted(pred)
    matches = align_accepted_candidates(gold, pred)

    cat_tp = cat_fp = cat_fn = 0
    temporal_total = temporal_ok = 0
    anchor_pred_total = anchor_gold_total = anchor_ok = 0

    for g, p, _ in matches:
        tp, fp, fn = _f1(g.get("topic_categories", []), p.get("topic_categories", []))
        cat_tp += tp
        cat_fp += fp
        cat_fn += fn

        temporal_total += 1
        if _norm(g.get("temporal_perspective")) == _norm(p.get("temporal_perspective")):
            temporal_ok += 1

        ga = _anchor_signature(g)
        pa = _anchor_signature(p)
        if ga is not None:
            anchor_gold_total += 1
        if pa is not None:
            anchor_pred_total += 1
        if ga is not None and pa is not None and ga == pa:
            anchor_ok += 1

    gold_relations = Counter(
        c.get("relation_to_prior")
        for c in gold.get("comparison_candidates", [])
    )
    pred_relations = Counter(
        c.get("relation_to_prior")
        for c in pred.get("comparison_candidates", [])
    )
    comparison_total = sum(gold_relations.values())
    comparison_ok = sum((gold_relations & pred_relations).values())

    false_explicit = max(
        0,
        pred_relations.get("EXPLICIT_CHANGE", 0)
        - gold_relations.get("EXPLICIT_CHANGE", 0),
    )

    gold_threads = {
        t.get("natural_key")
        for t in gold.get("thread_candidates", [])
        if t.get("natural_key")
    }
    pred_threads = {
        t.get("natural_key")
        for t in pred.get("thread_candidates", [])
        if t.get("natural_key")
    }
    thread_recall_n = len(gold_threads & pred_threads)
    vague_threads = sum(
        1
        for t in pred.get("thread_candidates", [])
        if _norm(t.get("normalized_primary_topic")) in VAGUE_TOPICS
    )

    total_candidates = len(pred.get("voice_candidates", []))
    return {
        "gold_accept_count": len(gold_accept),
        "pred_accept_count": len(pred_accept),
        "matched_accept_count": len(matches),
        "zero_voice_false_positive_accept_count": int(
            len(gold_accept) == 0 and len(pred_accept) > 0
        ),
        "exact_voice_count": int(len(gold_accept) == len(pred_accept)),
        "within_one_voice_count": int(abs(len(gold_accept) - len(pred_accept)) <= 1),
        "category_tp": cat_tp,
        "category_fp": cat_fp,
        "category_fn": cat_fn,
        "temporal_ok": temporal_ok,
        "temporal_total": temporal_total,
        "anchor_ok": anchor_ok,
        "anchor_pred_total": anchor_pred_total,
        "anchor_gold_total": anchor_gold_total,
        "thread_match_count": thread_recall_n,
        "gold_thread_count": len(gold_threads),
        "vague_theme_auto_thread_count": vague_threads,
        "comparison_ok": comparison_ok,
        "comparison_total": comparison_total,
        "false_explicit_change_count": false_explicit,
        "review_count": _reviews(pred),
        "pred_candidate_count": total_candidates,
    }


def aggregate(pair_metrics: list[Mapping[str, Any]]) -> dict[str, float | int]:
    n = max(1, len(pair_metrics))
    gold_accept = sum(x["gold_accept_count"] for x in pair_metrics)
    pred_accept = sum(x["pred_accept_count"] for x in pair_metrics)
    matched = sum(x["matched_accept_count"] for x in pair_metrics)

    cat_tp = sum(x["category_tp"] for x in pair_metrics)
    cat_fp = sum(x["category_fp"] for x in pair_metrics)
    cat_fn = sum(x["category_fn"] for x in pair_metrics)
    cat_precision = cat_tp / max(1, cat_tp + cat_fp)
    cat_recall = cat_tp / max(1, cat_tp + cat_fn)
    cat_f1 = (
        0.0 if cat_precision + cat_recall == 0
        else 2 * cat_precision * cat_recall / (cat_precision + cat_recall)
    )

    temporal_total = sum(x["temporal_total"] for x in pair_metrics)
    anchor_pred_total = sum(x["anchor_pred_total"] for x in pair_metrics)
    anchor_gold_total = sum(x["anchor_gold_total"] for x in pair_metrics)
    gold_thread_count = sum(x["gold_thread_count"] for x in pair_metrics)
    comparison_total = sum(x["comparison_total"] for x in pair_metrics)
    review_count = sum(x["review_count"] for x in pair_metrics)
    pred_candidate_count = sum(x["pred_candidate_count"] for x in pair_metrics)

    return {
        "accepted_voice_recall": matched / max(1, gold_accept),
        "accepted_voice_precision": matched / max(1, pred_accept),
        "exact_article_voice_count_rate": sum(x["exact_voice_count"] for x in pair_metrics) / n,
        "within_one_article_voice_count_rate": sum(x["within_one_voice_count"] for x in pair_metrics) / n,
        "topic_category_f1": cat_f1,
        "temporal_perspective_agreement": (
            sum(x["temporal_ok"] for x in pair_metrics) / max(1, temporal_total)
        ),
        "primary_anchor_precision": (
            sum(x["anchor_ok"] for x in pair_metrics) / max(1, anchor_pred_total)
        ),
        "primary_anchor_recall": (
            sum(x["anchor_ok"] for x in pair_metrics) / max(1, anchor_gold_total)
        ),
        "theme_thread_specificity_precision": (
            1.0 if sum(x["vague_theme_auto_thread_count"] for x in pair_metrics) == 0 else 0.0
        ),
        "thread_membership_recall": (
            sum(x["thread_match_count"] for x in pair_metrics) / max(1, gold_thread_count)
        ),
        "comparison_relation_accuracy": (
            sum(x["comparison_ok"] for x in pair_metrics) / max(1, comparison_total)
        ),
        "review_rate": review_count / max(1, pred_candidate_count),
        "zero_voice_false_positive_accept_count": sum(
            x["zero_voice_false_positive_accept_count"] for x in pair_metrics
        ),
        "false_explicit_change_count": sum(
            x["false_explicit_change_count"] for x in pair_metrics
        ),
        "vague_theme_auto_thread_count": sum(
            x["vague_theme_auto_thread_count"] for x in pair_metrics
        ),
        "case_count": len(pair_metrics),
    }


def apply_contract(metrics: Mapping[str, Any], contract: Mapping[str, Any]) -> dict[str, Any]:
    checks = []

    def check_value(name: str, spec: Mapping[str, Any]) -> None:
        if name not in metrics:
            return
        value = metrics[name]
        threshold = spec["threshold"]
        op = spec["operator"]
        ok = {
            "==": value == threshold,
            ">=": value >= threshold,
            "<=": value <= threshold,
        }[op]
        checks.append({
            "metric": name,
            "value": value,
            "operator": op,
            "threshold": threshold,
            "pass": ok,
        })

    for section in ["safety_gates", "quality_gates"]:
        for name, spec in contract.get(section, {}).items():
            check_value(name, spec)

    return {
        "checks": checks,
        "pass": all(x["pass"] for x in checks),
        "note": (
            "Metrics requiring human audit or external runtime evidence are not "
            "auto-computed and must be added before Production approval."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--contract", required=True)
    args = parser.parse_args()

    manifest = _load(Path(args.manifest))
    contract = _load(Path(args.contract))
    pair_metrics = []
    for item in manifest["cases"]:
        gold = _load(Path(item["gold"]))
        pred = _load(Path(item["pred"]))
        pair_metrics.append(evaluate_pair(gold, pred))

    metrics = aggregate(pair_metrics)
    result = apply_contract(metrics, contract)
    print(json.dumps({
        "metrics": metrics,
        "contract_result": result,
    }, ensure_ascii=False, indent=2))
    return 0 if result["pass"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
