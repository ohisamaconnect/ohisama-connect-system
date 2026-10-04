# OC-OS Apps Script Production Runtime

このディレクトリは、実際の Google Apps Script Production Project へ `clasp push` するための **現行Runtime専用領域** です。

## 原則

- `gas/` は開発履歴・Pilot・Legacy・ONE-OFFを含むため、直接pushしない。
- この `apps-script/runtime/` には、現行Productionとして必要な統合済みGASだけを置く。
- 過去Version依存（例: v1.2.8がv1.2.7/v1.2.6を必要とする構成）は、可能な限り現行系へ統合する。
- 現行系でも責務が異なるモジュール分割は許容する。
- `appsscript.json` は実際のProduction Projectから取得したmanifestを基準に管理する。
- `.clasp.json` とOAuth認証情報はGitへcommitしない。
- `clasp push` 前に必ず `clasp status` と差分確認を行う。

## 初期状態

このREADMEだけではProduction Runtimeは完成していません。
Crawler / Processor等を系統ごとに統合・検証した後、このディレクトリへ昇格します。

詳細: `docs/OC-OS_CLASP_SETUP_v1.0.md`
