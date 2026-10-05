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

ProductionへpushするCurrent Runtime定義は次の10ファミリ。HHA Member MaintenanceはCURRENT / PILOTとして扱う。

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
