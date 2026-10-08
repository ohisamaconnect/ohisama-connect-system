# MEMBER VOICES｜Semantic Provider + Prompt + Evaluation Contract Preview Report

Date: 2026-10-08 JST  
Result: **PREVIEW PASS — production provider evaluation not yet executed**

## 1. Approved scope completed

This block implemented the provider selection, prompt contract, deterministic materialization boundary, retry/failure policy, and 60-article evaluation contract.

No Notion write, no permanent Voice_ID allocation, and no bulk Archive processing occurred.

## 2. Provider selection

Primary production candidate:

- Google Gemini API
- `gemini-3.8-flash`
- thinking level = medium
- tools / grounding = disabled
- provider-side structured JSON enabled

Independent challenger:

- OpenAI API
- `gpt-5.4-mini-2026-03-17`
- reasoning effort = medium
- strict structured output enabled
- evaluation-only; no automatic production fallback

This selection was based on official model/API documentation checked on 2026-10-08. Pricing and model availability are operational dependencies and must be rechecked before large-scale processing.

## 3. Provider payload redesign

The LLM provider now emits temporary local refs only:

- U1/U2/... for Meaning Units
- V1/V2/... for VOICE Candidates
- T1/T2/... for Thread candidates
- C1/C2/... for Comparison candidates

It does not emit Source identity, Speaker identity, processing keys, Voice_ID, or permanent HHA IDs.

## 4. Adapter-owned deterministic IDs

`semantic_provider_contract.py` materializes the final Artifact v1.1 and generates:

- `mu_<24 hex>`
- `vc_<24 hex>`
- `thr_a_<24 hex>` / `thr_t_<24 hex>`
- `cmp_<24 hex>`

Machine key generation is therefore independent from model prose formatting and provider-local references.

## 5. Evidence and HHA safety

Local validation requires:

- Meaning Unit evidence excerpt is an exact ARTICLE_TEXT substring;
- CANONICAL HHA IDs are present in supplied Relation Context;
- PROVISIONAL anchors contain no permanent object ID;
- vague Theme topics cannot auto-thread;
- Thread formalization is adapter-owned;
- EXPLICIT_CHANGE safety is locally enforced.

Provider-side Structured Output is not treated as final validation authority.

## 6. Extractor version discipline

Extractor version binds:

- Prompt Version / SHA256
- Provider Payload Schema Version / SHA256
- Provider
- exact model ID
- thinking/reasoning configuration

Changing any of these creates a new extractor version.

## 7. Retry policy

Transport timeout / 429 / provider 5xx:

- same provider/config
- max 2 retries
- 2 sec then 8 sec backoff

Provider format failure:

- max 1 same-config retry

Semantic invariant failure or refusal:

- no automatic retry
- route to REVIEW

Cross-provider automatic fallback:

- disabled

## 8. Evaluation contract

Gold basis remains the already-approved 60-article Pilot:

- Calibration 10
- Main 30
- Temporal 20

Hard safety gates require zero wrong-Speaker attribution, zero invented Canonical HHA IDs, zero false EXPLICIT_CHANGE, zero zero-VOICE false-positive ACCEPTs, zero unsupported critical summary claims in human audit, zero vague Theme auto-threading, and 100% schema/source-returnability pass.

Quality gates include >=95% Accepted VOICE recall and precision, >=90% exact article-level VOICE count, >=98% within ±1 count, >=90% Topic Category F1, >=95% temporal agreement, 100% Anchor precision, >=90% Anchor recall, 100% Theme specificity precision, >=90% Thread recall, >=95% Comparison relation accuracy, and <=15% REVIEW rate.

Calibration 10 is repeated three times for stability.

## 9. Evaluation implementation

Added:

- `member_voices/eval/provider_eval.py`
- `member_voices/tests/validate_semantic_provider_eval.py`

Candidate alignment is evidence-based and does not require `mu_...` or `vc_...` equality across extractor versions.

This avoids treating processing-key changes as semantic quality failures.

The Category metric is named `topic_category_f1`; an earlier Preview draft name `topic_category_macro_f1` was corrected before this checkpoint because the current evaluator computes aggregated category F1, not per-category macro averaging.

## 10. Validation status

GitHub validation workflow now includes:

- semantic provider contract validation;
- semantic provider evaluator validation.

The current execution environment could not clone GitHub because external DNS is blocked, and the connector did not expose an observed workflow run.

Therefore:

- code / contract implementation is confirmed in repository;
- **local test PASS is not claimed**;
- **GitHub Actions PASS is not claimed**;
- **Gemini API evaluation is not claimed**;
- **OpenAI challenger evaluation is not claimed**;
- **60-article provider evaluation PASS is not claimed**.

## 11. Production SQLite read-only audit

Drive canonical file ID:

`1vwcDZ4UbJ6TuyzV5wllUnp0NAMvjRjot`

Read-only audit on 2026-10-08:

- file size = 217,088 bytes
- integrity_check = ok
- COMMITTED = 7
- RESERVED = 0
- MAX(sequence_no) = 7
- highest permanent ID = VOC-000007
- next permanent ID = VOC-000008
- SHA256 = `b3674236a63ce760c50b29610e01f627d11d847317914f5d95c7ab6cc08305de`

No database mutation occurred in this block.

## 12. Correct current state

The correct state is:

**PROVIDER / PROMPT / EVALUATION CONTRACT PREVIEW IMPLEMENTED**

It is not:

**PRODUCTION SEMANTIC PROVIDER PASSED**

## 13. Next restart point

**Production Provider Evaluation Pilot**

Recommended order:

1. establish executable API credential/runtime path;
2. run Gemini primary on Calibration 10;
3. repeat Calibration 10 three times;
4. run GPT-5.4 Mini challenger on sentinel cases;
5. evaluate + human-audit disagreements;
6. only after Calibration gate passes, run remaining Main 30 + Temporal 20;
7. compute full 60 metrics;
8. separate Production approval gate.

No Voice_ID or Notion write is required during evaluation.
