# MEMBER VOICES｜clasp Production Runtime Deployment v0.2

Date: 2026-10-09 JST  
Status: **GITHUB READY / LOCAL HUMAN GATE REQUIRED**

## Purpose

Deploy MEMBER VOICES Provider Evaluation Runner v0.2 through the established Production path:

GitHub
→ local repository
→ `apps-script/runtime/`
→ clasp
→ existing Google Apps Script Production Project.

Local repository:

`C:\Users\junas\Documents\ohisama-connect-system`

The repository root keeps a local-only `.clasp.json` with:

`rootDir = apps-script/runtime`

The `.clasp.json` and clasp credentials remain outside Git.

## Runtime promotion

Development/source path:

`apps-script/member_voices/MEMBER_VOICES_Provider_Eval_Current.gs`

clasp Production Runtime mirror:

`apps-script/runtime/MEMBER_VOICES_Provider_Eval_Current.gs`

GitHub CI requires these files to be byte-identical.

Runtime now contains 11 Current families. The MEMBER VOICES evaluator is manual-only and adds no trigger.

## Local deployment procedure

Open PowerShell.

```powershell
cd C:\Users\junas\Documents\ohisama-connect-system
git pull --ff-only
git status
powershell -ExecutionPolicy Bypass -File .\tools\audit_apps_script_runtime.ps1
clasp status
```

Proceed only if:

- git pull completes cleanly;
- local repository has no unintended modifications;
- Runtime Audit has no FAIL;
- clasp status shows only the intended `apps-script/runtime/` project content;
- `.clasp.json` still points to the existing Production Script ID and `apps-script/runtime`.

Then:

```powershell
clasp push
```

Do not use `--force`.

## Post-push verification

Open the existing Apps Script project:

```powershell
clasp open
```

Confirm:

- `MEMBER_VOICES_Provider_Eval_Current.gs` exists;
- existing OC-OS / HHA Current files still exist;
- Script Properties still exist;
- existing triggers remain installed;
- no MEMBER VOICES trigger was created automatically.

Run:

`reportGasRuntimeInventoryCurrent()`

Then run:

`memberVoicesEvalPreflightV02()`

Expected preflight state:

`status = READY`

Do not start Pass 1 unless preflight is READY.

## Safety boundary

This deployment does not itself:

- allocate a permanent Voice_ID;
- write MEMBER VOICES rows to Notion;
- mutate production MEMBER VOICES SQLite;
- process the full Archive;
- install a MEMBER VOICES trigger;
- execute Gemini evaluation automatically.

Gemini API use starts only when the evaluation functions are manually run after READY preflight.

## Current validation

GitHub Actions run #66:
- run_id: 37846174612
- head: fead66abd39dfcfa091b7204c7cbe9f9c0c12244
- conclusion: SUCCESS

The full local PowerShell Runtime Audit is still a human deployment gate and is not claimed as executed by GitHub CI.
