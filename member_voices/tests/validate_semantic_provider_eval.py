#!/usr/bin/env python3
"""Smoke validation for MEMBER VOICES semantic provider evaluator."""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MV_ROOT = HERE.parent
sys.path.insert(0, str(MV_ROOT / "eval"))

from provider_eval import aggregate, evaluate_pair


def load(name: str) -> dict:
    return json.loads(
        (MV_ROOT / "preview" / "2026-10-08" / name).read_text(encoding="utf-8")
    )


def main() -> int:
    zero = load("26676_matsuda_zero_voice.json")
    rich = load("65922_ota_values_expression.json")

    metrics = aggregate([
        evaluate_pair(zero, zero),
        evaluate_pair(rich, rich),
    ])

    assert metrics["accepted_voice_recall"] == 1.0
    assert metrics["accepted_voice_precision"] == 1.0
    assert metrics["exact_article_voice_count_rate"] == 1.0
    assert metrics["within_one_article_voice_count_rate"] == 1.0
    assert metrics["topic_category_f1"] == 1.0
    assert metrics["temporal_perspective_agreement"] == 1.0
    assert metrics["theme_thread_specificity_precision"] == 1.0
    assert metrics["thread_membership_recall"] == 1.0
    assert metrics["zero_voice_false_positive_accept_count"] == 0
    assert metrics["false_explicit_change_count"] == 0

    print(json.dumps({
        "exact_gold_smoke": metrics,
        "result": "PASS",
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
