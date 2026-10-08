# MEMBER VOICES｜Calibration 10 Gold Corpus Preservation Gap

Date: 2026-10-08 JST  
Status: **OPEN — evaluation execution blocked, logical Pilot remains approved**

## 1. What is missing

The MEMBER VOICES Calibration phase was completed and approved before the current Project Knowledge Preservation v1.1 rule was introduced.

The durable sources currently accessible preserve:

- the Pilot design: Calibration 10 / Main 30 / Temporal 20;
- the Calibration criteria and approval;
- the fact that Calibration included a valid 0 VOICE case;
- the later Main and Temporal conclusions;
- the Source Root and source-resolution rules.

They do **not** currently provide one durable data-bearing artifact that enumerates all of:

1. the exact 10 approved Calibration Article_ID values;
2. the expected Speaker for each;
3. the exact article.txt / metadata source identity for each;
4. the approved per-case Meaning Unit / VOICE gold artifact;
5. the hashes required to prove the gold has not changed.

## 2. Evidence checked

The following were inspected during Production Provider Evaluation preflight:

- Project Control history:
  - PC-20261007-50 / VOICE-20261007-14 — Pilot design;
  - PC-20261007-58 / VOICE-20261007-15 — Pilot Source Root and selection method;
  - PC-20261007-59 / VOICE-20261007-16 — Archive completeness boundary;
  - PC-20261007-62 / VOICE-20261007-17 — Source Identity rule;
  - PC-20261007-66 / VOICE-20261007-18 — Calibration criteria v1 approval;
  - PC-20261007-70 / -72 / -78 / -80 / -82 — Main / Temporal completion history.
- MEMBER VOICES Implementation Handover / Restart v1.0.
- MEMBER VOICES Schema v1.1 & Extraction / Thread Contract v1.0.
- GitHub repository searches for Calibration case manifests / gold artifacts.
- Project / Library file search for Calibration identifiers and outputs.
- Google Drive keyword searches for Calibration / Pilot artifacts.
- personal prior-context retrieval for the exact Calibration 10 set.

No trustworthy exact 10-case corpus was recovered from those durable sources.

Google Drive keyword results are not accepted as Calibration membership evidence because semantic/filename search can return unrelated Archive articles.

## 3. What must NOT happen

Do not:

- select a new 10-article sample;
- infer the original 10 from Drive search ranking;
- substitute Main or Temporal cases;
- regenerate gold with the new provider and call it approved Calibration gold;
- reopen or invalidate the already-approved logical Pilot merely because its data-bearing artifact was not preserved.

The issue is **preservation of the approved evaluation corpus**, not the validity of the approved extraction rules.

## 4. Repair artifact

A recovery-safe manifest contract now exists:

- `member_voices/eval/calibration_manifest_v0_1.schema.json`
- `member_voices/eval/CALIBRATION_10_MANIFEST.pending.json`

The manifest remains `PENDING_RECOVERY` until the original approved corpus is recovered.

Only `status=READY` with exactly 10 cases can authorize the provider evaluation runner.

Each READY case must carry source and gold identity, including SHA256.

## 5. API execution path

The existing OC-OS Apps Script runtime already uses Script Property:

`GEMINI_API_KEY`

The new evaluation runner reuses that secret location without copying the secret into GitHub or chat.

Runner:

`apps-script/member_voices/MEMBER_VOICES_Provider_Eval_Current.gs`

It uses the Gemini Interactions API and processes at most one Calibration article per invocation.

Output is evaluation evidence in Google Drive only.

It has no Notion write, production SQLite write, or permanent Voice_ID allocation path.

## 6. Current blocking condition

The executable runtime path is designed, but a valid evaluation cannot start until the exact approved Calibration 10 data-bearing corpus is recovered and written to a READY manifest.

This is the only valid restart point for the Production Provider Evaluation Pilot.

## 7. Preservation rule going forward

Once recovered, the Calibration 10 manifest and the 10 gold artifacts must be treated as durable evaluation assets.

They should be:

1. saved outside chat;
2. hash-pinned;
3. read back;
4. registered as a Project Knowledge Preservation data-bearing artifact;
5. never silently replaced by a new sample.

This prevents future provider/model changes from changing the test set itself.
