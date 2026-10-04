# OC-OS clasp Setup v1.0

基準日: 2026-10-04

## 1. 目的

Google Apps ScriptのProduction Runtimeを、Apps Scriptエディタへの手動コピペではなく、ローカルGit repositoryから `clasp` 経由で安全に同期できるようにする。

GitHub上の `gas/` は開発履歴・Pilot・Legacy・ONE-OFFを含むため、そのままProductionへpushしない。Production同期対象は `apps-script/runtime/` に限定する。

## 2. 安全原則

1. 初回導入時は `clasp push` しない。
2. まず既存Production Apps ScriptのScript IDを確認し、`clasp login` と読み取り確認を行う。
3. 既存Productionの内容を一度pull/cloneしてBaselineを確保する。
4. `.clasp.json`、`.clasprc.json`、OAuth client secretはGitへcommitしない。
5. Productionへ送るコードは `apps-script/runtime/` のみ。
6. push前に `clasp status` とGit差分を確認する。
7. `clasp push` はApps Script project全体の内容を置換するため、部分ファイル更新の感覚で実行しない。
8. Crawler/Processor等は系統ごとに統合・検証後にRuntimeへ昇格する。

## 3. 前提

公式claspの現行要件として Node.js 20.0.0 以上を使用する。

Windows PowerShellで確認:

```powershell
node --version
npm --version
```

Node.js 20未満、またはコマンドが見つからない場合はNode.jsを先に更新・導入する。

## 4. clasp インストール

```powershell
npm install -g @google/clasp
clasp --version
```

## 5. Apps Script API を許可

Google Apps Scriptのユーザー設定で Apps Script API を有効化する。

https://script.google.com/home/usersettings

この設定は、clasp等の外部ツールがApps Script projectの内容を管理するために必要。

## 6. Googleアカウントでログイン

Production Apps Scriptを所有・編集できるGoogle Workspaceアカウントで実行する。

```powershell
clasp login
```

ブラウザでGoogle認証を完了する。

認証情報は通常ユーザーホームの `.clasprc.json` に保存される。Gitへcommitしない。

## 7. Production Script ID を確認

既存Production Apps Scriptをブラウザで開き、Project Settingsから Script ID を確認する。

Script IDはScript Propertiesの値とは別物。

## 8. 初回Baseline取得

repository rootへ移動する。

例:

```powershell
cd C:\Users\junas\Documents\ohisama-connect-system
git pull
```

初回はProductionへ書き込まず、まず現在のApps Script内容を別領域へ取得して比較材料にする。

推奨:

```powershell
mkdir .clasp-snapshot
cd .clasp-snapshot
clasp clone <SCRIPT_ID>
cd ..
```

`.clasp-snapshot/` は `.gitignore` 対象。ここは現行Productionの退避・比較用であり、将来のpush元にはしない。

確認:

```powershell
Get-ChildItem .clasp-snapshot
```

## 9. Production Runtime用 .clasp.json

Baseline確認後、repository rootにローカル専用 `.clasp.json` を作る。

```json
{
  "scriptId": "<SCRIPT_ID>",
  "rootDir": "apps-script/runtime"
}
```

`.clasp.json` は `.gitignore` 対象でありcommitしない。

## 10. appsscript.json

既存ProductionのmanifestをBaselineから確認し、Production Runtimeのmanifestとして `apps-script/runtime/appsscript.json` に反映する。

初回はmanifestのtimezone、exception logging、advanced services、OAuth scopes等を勝手に変更しない。

## 11. push前確認

統合済みRuntimeが完成するまではpush禁止。

確認コマンド:

```powershell
clasp status
git status
git diff
```

必要に応じてApps Scriptをブラウザで開く:

```powershell
clasp open
```

## 12. 初回pushの条件

以下をすべて満たしてから初回pushする。

- Production Baseline取得済み
- Script ID照合済み
- `apps-script/runtime/appsscript.json` 確認済み
- Crawler/Processor等、対象系統の統合版が完成
- 現行トリガーhandler名との整合確認済み
- Script Properties依存確認済み
- `clasp status` のpush対象が意図したRuntimeだけ
- rollback用Baselineが存在

初回pushは `--force` を使わない。

```powershell
clasp push
```

## 13. 初回push後

Apps Script editorで以下を確認する。

- 想定ファイルだけ存在する
- manifestが維持されている
- Script Propertiesが維持されている
- Triggerが意図せず消えていない
- Production entry functionsが存在する

その後、WRITE=NONE Preview / Runtime Auditを実行し、問題がなければProduction実行へ進む。

## 14. 将来

手動clasp運用が安定してからのみ、GitHub Actionsによる自動pushを検討する。

当面は:

```text
ChatGPT / GitHub
    ↓
git pull
    ↓
clasp status
    ↓
人間確認
    ↓
clasp push
    ↓
Runtime Audit
```

とし、人間確認をProduction変更のゲートとして残す。
