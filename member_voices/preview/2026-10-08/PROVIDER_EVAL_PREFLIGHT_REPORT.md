# MEMBER VOICES｜Production Provider Evaluation Preflight Report

Date: 2026-10-08 JST  
Result: **INFRASTRUCTURE READY / CALIBRATION GOLD CORPUS RECOVERY REQUIRED**  
Provider API calls executed: **0**

## 1. Approved objective

The approved next block was Production Provider Evaluation Pilot:

1. Calibration 10 on Gemini primary;
2. three repeated runs for stability;
3. GPT-5.4 Mini challenger on sentinel cases;
4. only after Calibration PASS, Main 30 + Temporal 20;
5. full 60 metrics + human audit.

The logical 60-article Pilot remains approved and is not reopened.

## 2. Runtime path found

The existing OC-OS Apps Script runtime already reads Gemini credentials from Script Properties:

`GEMINI_API_KEY`

Therefore the MEMBER VOICES evaluator does not need a new secret location and must not copy the key into GitHub, Drive data files, logs, or chat.

No available ChatGPT connector can execute the user's Apps Script project directly or read its Script Properties.

## 3. New evaluation runner

Implemented:

`apps-script/member_voices/MEMBER_VOICES_Provider_Eval_Current.gs`

Properties:

- model = `gemini-3.8-flash`
- thinking level = `medium`
- Gemini Interactions API
- `store=false`
- structured JSON response_format
- at most one article per Apps Script invocation
- persistent run state in Script Properties
- Drive-only evaluation evidence output
- transport / 429 / 5xx retry only
- no cross-provider fallback
- no Notion write
- no production SQLite write
- no permanent Voice_ID allocation

Public runner functions:

- `memberVoicesEvalPreflightV01()`
- `memberVoicesEvalStartPass1V01()`
- `memberVoicesEvalStartPass2V01()`
- `memberVoicesEvalStartPass3V01()`
- `memberVoicesEvalRunNextV01()`
- `memberVoicesEvalStatusV01()`

The runner requires the Script Property:

`MEMBER_VOICES_CALIBRATION_MANIFEST_FILE_ID`

and refuses to call Gemini unless that manifest is READY and contains exactly 10 unique original Calibration cases.

## 4. Current Gemini API basis

The runner uses the current Interactions API shape for Gemini 3.8 Flash:

- model `gemini-3.8-flash`;
- `generation_config.thinking_level = medium`;
- `response_format` JSON schema;
- `store=false`.

The runner parses model output from completed Interaction `model_output` text steps.

## 5. Calibration preservation audit

The exact approved Calibration 10 corpus was searched in:

- Project Control history;
- MEMBER VOICES Implementation Handover / Restart v1.0;
- MEMBER VOICES Schema v1.1 & Extraction / Thread Contract v1.0;
- GitHub repository;
- Project / Library files;
- Google Drive keyword search;
- prior personal context retrieval.

The durable record confirms:

- Calibration 10 existed;
- it was approved as VOICE-20261007-18 / PC-20261007-66;
- it included a valid 0 VOICE case;
- granularity / Meaning Unit merge rules were calibrated;
- Main 30 and Temporal 20 continued afterward.

However, the currently accessible durable sources do not identify one trustworthy data-bearing bundle containing the exact 10 Article_ID values plus their approved per-case gold artifacts.

Google Drive semantic search results are not accepted as proof that a file belonged to Calibration 10.

## 6. Preservation repair

Added:

- `member_voices/eval/calibration_manifest_v0_1.schema.json`
- `member_voices/eval/CALIBRATION_10_MANIFEST.pending.json`
- `member_voices/eval/CALIBRATION_GOLD_RECOVERY_GAP_2026-10-08.md`

The pending manifest is deliberately empty.

It must not be replaced by a newly selected sample.

READY requires exactly 10 original cases and, for every case:

- Article_ID;
- expected Speaker;
- Native Local_Dir / Original URL;
- article.txt Drive file ID + SHA256;
- metadata Drive file ID;
- approved gold artifact Drive file ID + SHA256;
- Published/Spoken time;
- Relation Context;
- Comparison Context.

## 7. Why execution stopped

Running Gemini against a newly selected 10 would not test the same approved Calibration.

It would change the test set after the provider and thresholds were designed, invalidating the evaluation.

Therefore no Gemini request was issued.

This is an evaluation-corpus preservation gap, not a failure of the approved MEMBER VOICES logical model.

## 8. Validation / workflow

Added:

- `member_voices/tests/validate_gas_eval_runner_contract.py`

The GitHub MEMBER VOICES validation workflow now includes the static runner contract audit.

No GitHub Actions run is claimed as observed in this block.

## 9. Production boundaries

Unchanged:

- Accepted permanent VOICE count = 7
- highest Voice_ID = VOC-000007
- next Voice_ID = VOC-000008
- Notion write = none
- production SQLite mutation = none
- bulk Archive processing = none

## 10. Correct next restart

**Calibration Gold Recovery Gate**

Recover the original approved Calibration 10 case list and gold outputs without semantic re-selection.

After recovery:

1. save / hash the 10 gold artifacts outside chat;
2. complete the READY manifest;
3. read back all 10 source/gold hashes;
4. register as a durable Project Knowledge Preservation artifact;
5. set `MEMBER_VOICES_CALIBRATION_MANIFEST_FILE_ID` in the existing Apps Script project;
6. run preflight;
7. run Pass 1 / Pass 2 / Pass 3 one article at a time;
8. evaluate stability and challenger differences.

Do not run Main 30 / Temporal 20 until this Calibration gate is valid and passes.
