# OC-OS Apps Script Production Runtime

このディレクトリは、実際の Google Apps Script Production Project へ `clasp push` するための **現行Runtime専用領域** です。

## 原則

- `gas/` は開発履歴・Pilot・Legacy・ONE-OFFを含むため、直接pushしない。
- `apps-script/runtime/` には、現行Productionとして必要な統合済みGASだけを置く。
- 過去Version依存（例: v1.2.8がv1.2.7/v1.2.6を必要とする構成）は、Current系へ統合する。
- 現行系でも責務が異なるモジュール分割は許容する。
- `appsscript.json` は実際のProduction Project由来のmanifestを基準に管理する。
- `.clasp.json` とOAuth認証情報はGitへcommitしない。
- `clasp push` 前に `clasp status` と `tools/audit_apps_script_runtime.ps1` を確認する。

## Current Runtime

2026-10-05の初回clasp移行で、旧約60ファイル構成からCurrent Runtimeへ統合した。

ProductionへpushするCurrent Runtime定義は次の11ファミリ。HHA Member MaintenanceとMEMBER VOICES Provider EvaluationはCURRENT / PILOTとして扱う。

- `OCOS_Crawler_Current.gs`
- `OCOS_Processor_Current.gs`
- `OCOS_Suggestion_Current.gs`
- `OCOS_Weekly_Current.gs`
- `OCOS_PostRecording_Current.gs`
- `OCOS_Messages_Current.gs`
- `OCOS_Calendar_Current.gs`
- `OCOS_ArchivePublishing_Current.gs`
- `OCOS_Diagnostics_Current.gs`
- `HHA_Member_Maintenance_Current.gs` — HHA MEMBERS定期監査。CURRENT / PILOT。Canonical自動更新なし、Trigger未導入。
- `MEMBER_VOICES_Provider_Eval_Current.gs` — MEMBER VOICES Production Provider Evaluation用。CURRENT / PILOT。手動実行のみ。既存`GEMINI_API_KEY`を再利用し、Calibration評価証拠はDriveへ保存するが、Notion VOICE・production SQLite・永久Voice_IDへは書き込まない。

`OCOS_Deployment_Bridge.gs` は初回移行時のみ使用し、Crawler / ProcessorのCurrent Trigger移行完了と `reportGasRuntimeInventoryCurrent()` の `migrationComplete=true` 確認後に削除した。Git履歴には移行証跡として残る。

## Trigger移行後の基準

Current必須Triggerは、少なくとも次を各1本とする。

- `runFrequentCrawlerCurrent`
- `runScheduleCrawlerCurrent`
- `runDailyCrawlerCurrent`
- `runInboxProcessorCurrent`
- `onMessageFormSubmitV01`

Studio系の `runStudioCandidateSeederV01` / `generateStudioPackV01` はWeekly Current内で同名handlerを維持する。

詳細: `docs/OC-OS_CLASP_SETUP_v1.0.md`


## MEMBER VOICES Provider Evaluation の同期

開発側正本:

`apps-script/member_voices/MEMBER_VOICES_Provider_Eval_Current.gs`

clasp配布用Runtime mirror:

`apps-script/runtime/MEMBER_VOICES_Provider_Eval_Current.gs`

両者は同内容を維持する。GitHub CIで一致を検証する。

ローカルProduction同期の標準手順:

```powershell
cd C:\Users\junas\Documents\ohisama-connect-system
git pull --ff-only
powershell -ExecutionPolicy Bypass -File .\tools\audit_apps_script_runtime.ps1
clasp status
clasp push
```

push後はApps Scriptエディタで `memberVoicesEvalPreflightV02()` を手動実行し、READYを確認してからCalibration Passへ進む。
