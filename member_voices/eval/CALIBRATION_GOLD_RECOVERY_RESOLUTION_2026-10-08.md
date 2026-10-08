# MEMBER VOICES｜Calibration 10 Core Recovery Resolution

Date: 2026-10-08 JST  
Status: **CORE RECOVERY PASS / FULL ARTIFACT v1.1 GOLD NOT RECOVERED**

The original approved Calibration 10 was recovered without selecting replacement articles.

Recovered Article_IDs:
25481, 26676, 33683, 35133, 65922, 67706, 50967, 55209, 25939, 44109.

For all 10 cases, Personal Blog Archive source identity was read back:
Article_ID, Speaker/Author, Published_At, Original_URL, Local_Dir, metadata.json file ID,
article.txt file ID, and article.txt SHA256.

Durable semantic-core gold:
- path: member_voices/eval/CALIBRATION_10_RECOVERED_GOLD_v0.1.json
- commit: ae9d80c409c2d3ed99ef30157ebe80a3bb918d04
- SHA256: 029b95ea134ecee0e63adc137cd744a064902eab2e7b888bd683510312464682

READY manifest:
- path: member_voices/eval/CALIBRATION_10_MANIFEST.ready.json
- commit: a1e60999da8342ee7aa00569be304d5d78842708
- manifest_version: 0.2
- exact cases: 10

Historical Calibration judgments preserved include:
- Article_ID 26676 = 0 VOICE.
- Article_ID 50967 = 2 Accepted VOICE + 1 boundary candidate.
- recovered Meaning Unit / VOICE semantic-core wording for all 10 cases.

A complete historical Extraction Artifact v1.1 was not preserved and was not regenerated.
Therefore recovered Calibration gold is NOT historical gold for full Category, Primary Anchor,
Thread, or Comparison metrics.

Calibration-only pre-gate:
- member_voices/eval/calibration_recovered_eval.py
- member_voices/eval/CALIBRATION_RECOVERED_EVAL_CONTRACT_v0.1.json

The full 60-article Production contract remains unchanged:
- member_voices/eval/SEMANTIC_PROVIDER_EVAL_CONTRACT_v0.1.json

Runner v0.2:
- apps-script/member_voices/MEMBER_VOICES_Provider_Eval_Current.gs
- reuses existing GEMINI_API_KEY Script Property
- uses commit-pinned READY manifest
- verifies recovered gold SHA256
- hard-checks exact Calibration Article_ID set
- verifies article.txt SHA256
- checks exact evidence excerpts and local semantic invariants
- one invocation processes at most one article
- no Notion write
- no production SQLite mutation
- no permanent Voice_ID allocation

No Gemini API call was executed during recovery.

Next executable point:
1. Runner v0.2 in the existing Apps Script project.
2. memberVoicesEvalPreflightV02()
3. Pass 1 / Pass 2 / Pass 3, one article per invocation.
4. Calibration recovered-gold automatic metrics + human semantic-core audit.
5. Only after Calibration Gate PASS, decide Main / Temporal evaluation.

The logical approved 60-article Pilot is not reopened.
