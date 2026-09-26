# OC-OS GAS Deployment Inventory v1.0

基準日: 2026-09-26

## 1. 目的

この文書は、GitHub上のOC-OS関連GASと、実際のApps Script本番環境への導入状態を混同しないための棚卸し表である。

重要な区別:

```text
GitHubにコードがある
≠ Apps Scriptへ導入済み
≠ Trigger設定済み
≠ 実データで成功済み
```

ChatGPTから現行Apps Scriptプロジェクト内のファイル一覧を直接読み取ることはできないため、`GAS導入状態` は以下の証拠レベルで記録する。

- `RUN EVIDENCE` : 過去の実行ログ、またはNotion/Driveに実行成果が残る
- `PRIOR HANDOVER` : 直前の構築引継ぎで既存GAS側にあるものとして扱われている
- `VERIFY` : GitHub上はCurrentだが実GASへの導入有無・版一致は未確認
- `ADD BEFORE PILOT` : GitHub上のCurrentで、Pilot前にGASへ追加が必要
- `LEGACY / DO NOT DEPLOY` : 履歴としてのみ保持。新規導入しない
- `SOURCE GAP` : GASで動作実績があるが、対応するGitHub本体ソースを確認できない

この文書は `docs/OC-OS_ACTIVE_LEGACY_MODULES_v1.0.md` と併用する。

---

## 2. 最優先 Findings

### 2.1 Inbox Processor本体のSource Gap

本番GASでは `runInboxProcessorV01()` の実行・Hourly Trigger設定の過去ログがある。

一方、2026-09-26時点のGitHub検索では次のProcessor本体ソースを確認できなかった。

```text
runInboxProcessorV01()
Processor_Version
Processor_Error
Origin_Inbox
```

GitHubにはTrigger helper:

```text
gas/ohisama_inbox_processor_trigger_v0.1.gs
```

が存在し、同ファイル自身も `runInboxProcessorV01()` が同一Apps Script projectに必要だと明記している。

したがって現状は:

```text
Runtime evidence exists
+
Trigger helper source exists
+
Processor main source not found in GitHub
```

という **SOURCE GAP** の可能性が高い。

### 必須対応

実GASプロジェクト内のProcessor本体を確認し、現行ソースをGitHubへ退避・Version固定する。

これは9/30収録そのものを妨げる問題ではないが、OC-OSの再現性・復旧性に関わるため最優先の管理課題とする。

---

## 3. Current Deployment Inventory

| 領域 | GitHub module | GitHub判定 | GAS証拠 | 現在のAction |
|---|---|---|---|---|
| INBOX収集 | `ohisama_inbox_crawler_v1.2.6` | CURRENT | Notion上でv1.2.6を現行版として確定。実GASとのファイル一致は未再確認 | 実GASのファイル名/Versionを照合 |
| INBOX処理 | `runInboxProcessorV01()` 本体 | CURRENT runtime / SOURCE GAP | 正常系Pilot・Hourly Triggerの過去実行ログあり | **実GASからGitHubへソース回収** |
| INBOX Trigger | `ohisama_inbox_processor_trigger_v0.1.gs` | CURRENT helper | Hourly Trigger導入の過去ログあり | 本体回収後に同一projectで版確認 |
| STUDIO | `ocos_studio_automation_v0.1.0.gs` | CURRENT | 2026-10-04 EPISODEに `Studio_Pack_URL` / `Studio_Pack_Version=v0.1.0` / generated_at が存在 | 実GASがGitHub版と一致するか確認 |
| MESSAGES Form | `oc_os_messages_form_sync_v0.1.1.gs` | CURRENT | 導入状態未確認 | Form Submit Trigger有無を確認 |
| MESSAGES Gmail Preview | `oc_os_messages_gmail_preview_v0.1.2.gs` | CURRENT / PREVIEW | 導入状態未確認 | Gmail intakeを使うprojectで版確認 |
| MESSAGES Gmail Sync | `oc_os_messages_gmail_sync_v0.1.0.gs` | CURRENT / MANUAL | 導入状態未確認 | Gmail intakeを使うprojectで版確認 |
| Weekly Bootstrap | `oc_os_weekly_episode_bootstrap_v0.1.0.gs` | CURRENT / PREVIEW | 導入状態未確認 | 2026-10-04 Pilotには必須でない。Pilot後の次週生成前に導入判断 |
| Actuals | `oc_os_episode_actuals_finalizer_v0.1.0.gs` | CURRENT | 直前のPost-Recording設計では既存依存として扱われるが、現行GAS版は未再確認 | Post-Recording bundle導入時に版照合 |
| Post-Recording Intake | `oc_os_post_recording_intake_v0.2.0.gs` | CURRENT | 同上 | Post-Recording bundle導入時に版照合 |
| Transcript Materializer | `oc_os_transcript_materializer_v0.1.0.gs` | CURRENT / PREVIEW | GitHub実装済み。実GAS導入は未確認 | **Post-Recording Pilot前に追加** |
| Post-Recording Integrator | `oc_os_post_recording_integrator_v0.1.0.gs` | CURRENT / PREVIEW | GitHub実装済み。実GAS導入は未確認 | **Post-Recording Pilot前に追加** |
| STATEMENTS Import | `oc_os_statement_candidate_importer_v0.1.0.gs` | CURRENT / PREVIEW | 実GAS導入・実データPilot未確認 | Transcript Pilot後に追加/Preview |
| Publication Context | `oc_os_publication_context_builder_v0.1.0.gs` | CURRENT / PREVIEW | 実GAS導入・実データPilot未確認 | Transcript/Statements後に追加 |
| Publication Draft Import | `oc_os_publication_draft_importer_v0.1.0.gs` | CURRENT / PREVIEW | 実GAS導入・実データPilot未確認 | Publication Draft Pilot前に追加 |
| Calendar Sync | `oc_os_episode_calendar_sync_v0.1.0.gs` | CURRENT / PREVIEW | Currentとして2026-09-26に確定。実GAS導入未確認 | Calendar Pilot時に追加。旧Bridgeは入れない |
| Lifecycle Auditor | `oc_os_episode_lifecycle_auditor_v0.1.0.gs` | CURRENT / READ ONLY | 実GAS導入未確認 | Core Pilot後でもよい。安全な診断用 |
| Completion Gate | `oc_os_episode_completion_gate_v0.1.0.gs` | CURRENT / READ ONLY | 実GAS導入未確認 | Core Pilot後でもよい。Status変更はしない |
| Weekly Readiness | `oc_os_weekly_readiness_report_v0.1.0.gs` | CURRENT / READ ONLY | 実GAS導入未確認 | Post-Recording dependencies導入後に追加可能 |

---

## 4. 2026-10-04 End-to-End Pilotに必要なGAS

### 4.1 収録前までに既に必要な系

```text
CURRENT Crawler
Inbox Processor
Studio Automation
```

2026-10-04 EPISODEにはStudio Pack成果がすでに存在するため、収録準備系は実データ成果まで確認できている。

### 4.2 9/30収録後のPost-Recording Pilotまでに必要

同一Apps Script projectで以下4本を揃える。

```text
oc_os_episode_actuals_finalizer_v0.1.0.gs
oc_os_post_recording_intake_v0.2.0.gs
oc_os_transcript_materializer_v0.1.0.gs
oc_os_post_recording_integrator_v0.1.0.gs
```

Integratorは上記3モジュールの内部helperを呼ぶため、同一project依存とする。

Write前に:

```text
OC_TARGET_EPISODE_KEY = 2026-10-04
```

を設定する。

実行順:

```text
previewTranscriptMaterializerV01()
↓
materializeFormalTranscriptDocV01()
↓
人間確認
↓
previewPostRecordingIntegrationV01()
↓
人間確認
↓
syncPostRecordingIntegrationV01()
```

収録前にはMaterialize / Syncを行わない。

---

## 5. Post-Recording後に段階導入するGAS

### Statements

```text
oc_os_statement_candidate_importer_v0.1.0.gs
```

AI候補JSONをNotion STATEMENTSへ候補として取り込む。
人間が確定するまでCanonical発言扱いしない。

### Publications

```text
oc_os_publication_context_builder_v0.1.0.gs
oc_os_publication_draft_importer_v0.1.0.gs
```

Current flow:

```text
Official Transcript
+ EPISODE Actuals
+ Confirmed STATEMENTS
→ Context Pack
→ AI Draft JSON
→ Draft Importer
→ PUBLICATIONS = 下書き
```

### Diagnostics

```text
oc_os_episode_lifecycle_auditor_v0.1.0.gs
oc_os_episode_completion_gate_v0.1.0.gs
oc_os_weekly_readiness_report_v0.1.0.gs
```

これらは人間の判断を置き換えないread-only診断層。

### Calendar

```text
oc_os_episode_calendar_sync_v0.1.0.gs
```

CalendarはMirrorでありCanonicalではない。
初回PilotではRecording all-day marker + Air eventのみを同期する。

---

## 6. LEGACY / DO NOT DEPLOY

### Calendar legacy

```text
oc_os_calendar_bridge_v0.1.0.gs
```

WRITE handler `syncEpisodeCalendarBridgeV01()` はGitHub上で停止済み。
Currentは `oc_os_episode_calendar_sync_v0.1.0.gs`。

### PUBLICATIONS legacy

```text
oc_os_publication_plan_seeder_v0.1.0.gs
```

WRITE handler `seedPublicationPlanV01()` はGitHub上で停止済み。
CurrentはDraft Importer flow。

### Historical Crawler versions

```text
ohisama_inbox_crawler_v1.2.1
ohisama_inbox_crawler_v1.2.2
ohisama_inbox_crawler_v1.2.3
ohisama_inbox_crawler_v1.2.4
ohisama_inbox_crawler_v1.2.5
ohisama_inbox_crawler_v1_1_3.gs
ohisama_inbox_crawler_v1_2_0.gs
```

Currentはv1.2.6のみ。
同名function/const競合を避けるため、歴代Crawlerを同一GAS projectへ同時投入しない。

### Old / historical repository scripts

次のような旧構築・HHA/旧OCOS系スクリプトを、`gas/` に存在するという理由だけでCurrent OC-OS projectへ一括投入しない。

```text
00_Config
10_Crawlers
20_Logic
30_Utils
40_MemberArchiver
60_WikiLoader
61_LocalHistoryLoader
62_OfficialHistoryLoader
70_SetlistFetcher
75_MusicStatsFetcher
HHA_Legacy_OCOS_Snapshot_v1_1.gs
```

必要な場合は個別に役割を監査してから扱う。

### Test-only helper

```text
ohisama_inbox_processor_idempotency_test_v0.1.gs
```

Production常駐必須モジュールではなく検証用として扱う。

---

## 7. 実GAS照合チェックリスト

Apps Script UIで実際のprojectを開き、次を確認する。

### A. Core Collector / Processor

- [ ] Crawlerがv1.2.6だけになっている
- [ ] `runInboxProcessorV01()` を含む本体ファイル名を特定する
- [ ] Processor本体をGitHubへ退避する
- [ ] Hourly Triggerが `runInboxProcessorV01` に1件だけ存在する
- [ ] 旧Crawlerが同居していない

### B. Studio

- [ ] `OC_STUDIO_V01.VERSION = 0.1.0` 相当のStudio Automationが存在する
- [ ] Candidate Seeder / Studio Pack handlerが重複していない
- [ ] 不要な重複Triggerがない

### C. Post-Recording bundle

- [ ] `oc_os_episode_actuals_finalizer_v0.1.0.gs`
- [ ] `oc_os_post_recording_intake_v0.2.0.gs`
- [ ] `oc_os_transcript_materializer_v0.1.0.gs`
- [ ] `oc_os_post_recording_integrator_v0.1.0.gs`
- [ ] 4本が同一projectにある
- [ ] `OC_TARGET_EPISODE_KEY` をPilot対象に設定できる
- [ ] 自動Triggerは付けない

### D. Legacy exclusion

- [ ] `oc_os_calendar_bridge_v0.1.0.gs` は削除または無効
- [ ] `oc_os_publication_plan_seeder_v0.1.0.gs` は削除または無効
- [ ] 歴代Crawlerはv1.2.6以外を同居させない

---

## 8. Deployment Promotion Rule

今後、GitHubで新しいGASを作っただけでは `導入済` と呼ばない。

昇格は以下とする。

```text
GitHub Current
↓
GAS Copy / Version Verify
↓
Preview成功
↓
Human Review
↓
Write Pilot成功
↓
再実行時Idempotency確認
↓
Production Confirmed
```

Read-only moduleはWrite Pilot不要だが、対象EPISODEを正しく解決して期待レポートを返すことを確認する。

---

## 9. Current Priority

収録日前に急いで全Current moduleをGASへ入れる必要はない。

優先順位:

```text
P0  Inbox Processor SOURCE GAP解消
P1  現行GASのVersion棚卸し
P2  Post-Recording 4-module bundleを9/30後Pilot前に揃える
P3  Statements / Publications
P4  Calendar / Lifecycle / Completion / Readiness
P5  Weekly Bootstrap自動化判断
```

OC-OSの原則どおり、GAS棚卸しが未完でも水曜日の収録は行える。
