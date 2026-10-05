# OC-OS Component Registry v1.0

基準日: 2026-10-05

## 1. 目的

OC-OSの構築では、現行Production、Pilot中の機能、診断・構築補助、過去の試作・移行用コードが同じGitHub履歴に存在する。

この文書の目的は、**あさくらじゅんが見るものを少なくすることではない**。

構築中に必要なものは十分に残し、今後の運用・保守・再検証に必要なものは管理して保持する。一方で、構築時に作成し検証を終え、今後使う必要がないものを惰性でmain branchやProduction Runtimeへ残し続けないことを目的とする。

上位原則はProject Canonical Principles、週次運用の正本は `docs/OC-OS_WEEKLY_STANDARD_OPERATION_v1.0.md` とする。

## 2. 2種類のStatusを分ける

### Runtime Status

| Status | 意味 |
|---|---|
| CURRENT / PRODUCTION | 毎週の標準運用で使う現行系 |
| CURRENT / PILOT | 完成形に必要だが実データ検証・本運用確認が残る現行系 |
| SUPPORT / DIAGNOSTIC | 構築・監査・障害時に再利用する補助系 |
| LEGACY / HISTORY | 現行Runtimeでは使わない過去仕様 |
| ONE-OFF / MIGRATION | Backfill、Cleanup、競合解消等の一度きり処理 |

### Asset Lifecycle Status

| 判定 | 意味 |
|---|---|
| 継続利用 | 今後の通常運用・保守に必要。残す |
| 構築完了まで保持 | 現在の構築・検証・移行確認に必要。終了条件を満たすまで残す |
| 履歴保存 | 現行処理には不要だが、再現・設計判断・監査証拠として残す価値がある |
| 削除候補 | 役割終了済み。依存・結果確認後にmain / Runtime / 作業領域から除去できる |

**コードがGitHubに存在すること、GAS Runtimeに存在すること、実データPilotに成功したこと、継続安定運用できていることは別の状態として扱う。**

Git履歴自体が過去版を保持するため、「履歴を残す」ことと「古いファイルをmain branchへ置き続ける」ことも同義ではない。

## 3. CURRENT / PRODUCTION — 継続利用

2026-10-04 Runtime ValidationでCore Production Runtime Confirmedとなった系統。

### INBOX

- `gas/ohisama_inbox_crawler_v1.2.8_revision_chain_production_runner.gs`
- `gas/ohisama_inbox_crawler_v1.2.6` — v1.2.8 RunnerのBase dependency
- `gas/ohisama_inbox_processor_ready_only_v0.1.2.gs`
- `gas/ohisama_inbox_processor_v0.1.gs` — Processor Base
- `gas/ohisama_inbox_processor_trigger_v0.1.2.gs`

### Weekly production

- `gas/ocos_studio_automation_v0.1.0.gs`
- `gas/oc_os_weekly_episode_bootstrap_v0.1.0.gs`
- `gas/oc_os_target_episode_lock_manager_v0.1.0.gs`
- `gas/oc_os_episode_actuals_finalizer_v0.1.0.gs`
- `gas/oc_os_post_recording_intake_v0.2.0.gs`
- `gas/oc_os_transcript_materializer_v0.1.0.gs`
- `gas/oc_os_post_recording_integrator_v0.1.0.gs`

### MESSAGES — confirmed route

- `gas/oc_os_messages_form_sync_v0.1.1.gs`

Form→MESSAGESは実装・稼働記録がある。Gmail routeはPilotへ分ける。

### Local transcription

正式Contractは `docs/OC-OS_TRANSCRIPT_ARTIFACT_CONTRACT_v1.0.md`。

- Current entry: `transcription/transcribe_episode_v0.4.1.py`
- Base dependency: `transcription/transcribe_episode_v0.4.0.py`
- Grounded cleanup: `transcription/hha_clean_transcript.py`
- Terms: `transcription/hha_transcription_terms.json`, `transcription/oc_transcription_terms.json`
- Environment definition: `transcription/requirements.txt`

旧v0.3.0 `transcription/transcribe_episode.py` は現行依存がないことを確認し、2026-10-04にmain branchから削除済み。Git履歴から参照・復元できる。

`.venv`本体は再生成可能なローカル実行環境であり、EPISODE成果物ではない。

## 4. CURRENT / PILOT — 構築完了まで保持

以下は完成形に必要な現行設計であり、Legacyではない。実地確認が終わるまで保持する。

### HHA Member Maintenance

HHA MEMBERSを公式Roster / Profileと定期照合する現行系。

- `docs/HHA_MEMBER_MAINTENANCE_CONTRACT_v0.1.md`
- `gas/hha_member_maintenance_v0.1.2.gs`
- `gas/hha_member_raw_snapshot_pilot_v0.1.0.gs`
- `apps-script/runtime/HHA_Member_Maintenance_Current.gs`

2026-10-05にCanonical Integrity / Roster / ProfileのStandalone Pilotを完了。

Raw Snapshot保存Pilotでは既存 `HHA_Member_Watcher/Raw_Snapshots` へRoster 1件・Profile 1件を保存し、SHA-256による重複保存防止も確認済み。

Runtime Statusは **CURRENT / PILOT**。
Canonical自動更新・Notion WRITE・自動Triggerは未導入。
継続安定運用確認後にCURRENT / PRODUCTION判定する。
### MESSAGES Gmail route

- `gas/oc_os_messages_gmail_preview_v0.1.2.gs`
- `gas/oc_os_messages_gmail_sync_v0.1.0.gs`

Runtimeでモジュール存在は確認済み。ただし実メール取込成功とは別なので、実地確認完了までPilot。

### STATEMENTS

- `docs/OC-OS_STATEMENTS_CONTRACT_v1.0.md`
- `prompts/oc_os_statement_extractor_v1.0.md`
- `schemas/oc_os_statement_candidates_v1.schema.json`
- `gas/oc_os_statement_candidate_importer_v0.1.0.gs`

### PUBLICATIONS

- `docs/OC-OS_PUBLICATIONS_CONTRACT_v1.0.md`
- `docs/OC-OS_PUBLIC_TALK_AUDIO_CONTRACT_v1.0.md`
- `prompts/oc_os_publication_draft_v1.0.md`
- `schemas/oc_os_publication_draft_v1.schema.json`
- `publication/`
- `gas/oc_os_publication_context_builder_v0.1.0.gs`
- `gas/oc_os_publication_draft_importer_v0.1.0.gs`

### Calendar integration

- `docs/OC-OS_CALENDAR_INTEGRATION_v1.0.md`
- `gas/oc_os_episode_calendar_sync_v0.1.0.gs`

Google Calendar自体の収録・本放送・再放送予定は実用中。残るPilotはEPISODESとの同期とEvent ID記録。

### Weekly handoff

- `docs/OC-OS_WEEKLY_CONTROL_CONTRACT_v1.0.md`
- `docs/OC-OS_WEEKLY_CYCLE_HANDOFF_CONTRACT_v0.1.md`
- `gas/oc_os_weekly_review_queue_resolver_v0.1.0.gs`

次週切替の実運用確認まで保持する。

## 5. SUPPORT / DIAGNOSTIC — 継続利用

以下は毎週実行しなくても、変更後監査・障害切り分け・復旧・引継ぎに再利用するため残す。

- `gas/oc_os_gas_runtime_audit_v0.1.0.gs`
- `gas/oc_os_episode_lifecycle_auditor_v0.1.0.gs`
- `gas/oc_os_episode_completion_gate_v0.1.0.gs`
- `gas/oc_os_weekly_readiness_report_v0.1.0.gs`
- `docs/OC-OS_GAS_DEPLOYMENT_INVENTORY_v1.0.md`
- `docs/OC-OS_EPISODE_LIFECYCLE_AUDIT_v1.0.md`
- `docs/OC-OS_EPISODE_COMPLETION_GATE_v1.0.md`
- `docs/OC-OS_WEEKLY_READINESS_v1.0.md`

日付付きRuntime Validation / Audit記録は、重要な昇格・変更判断の証拠として履歴保存する。

## 6. LEGACY / HISTORY

現行Runtimeへ戻さないことが確定している代表例:

- `gas/oc_os_calendar_bridge_v0.1.0.gs`
- `docs/OC-OS_CALENDAR_CONTRACT_v1.0.md`
- `gas/oc_os_publication_plan_seeder_v0.1.0.gs`
- `gas/HHA_Legacy_OCOS_Snapshot_v1_1.gs`
- Crawler旧版 v1.1.x / v1.2.0〜v1.2.5、v1.2.7検証系
- Processor旧Trigger・テスト系

旧OCOS V5系 `00_Config`, `10_Crawlers`, `20_Logic`, `30_Utils`, `40_MemberArchiver`, `60_WikiLoader`, `61_LocalHistoryLoader`, `62_OfficialHistoryLoader`, `70_SetlistFetcher`, `75_MusicStatsFetcher` はLegacy候補。ただしHHA側を含む現行依存がないことを最終監査するまでは「構築完了まで保持」とし、監査後に履歴保存または削除候補へ振り分ける。

Legacyの全ファイルをmain branchへ永久保存する必要はない。設計比較に必要な最終版・Contract・重要な検証証拠だけを履歴保存対象として選ぶ。

## 7. ONE-OFF / MIGRATION — 削除候補。ただし結果確認が先

代表例:

- INBOX duplicate cleanup
- deterministic backfill
- manual conflict M02812 / M02813
- parent backfill
- revision observation type stage / preview / commit
- AI suggestion staged commit / revision guardの過去段階
- 各種preview-only / dry-run

これらは「コードが作られた」ことだけでは削除しない。

削除前に以下を確認する。

1. 対象データへのWriteが実行済みか。
2. 実行結果がCanonical状態として確認済みか。
3. 再実行の必要がないか。
4. 現行コードから依存されていないか。
5. 後世に残す必要があるのはコード本体か、実行結果・判断記録だけか。

条件を満たせばmain branchから削除できる。過去コードはGit履歴から復元可能。

M02812 / M02813についてはPreview→Stage→Commitコードの存在までは確認済みだが、2026-10-04時点の今回監査では実データWrite成功証拠まで未確認のため、まだ削除しない。

## 8. Notion

### 継続利用

現行OC-OS主要DB:

- INBOX
- SOURCES
- EVENTS
- EPISODES
- STUDIO ITEMS
- MESSAGES
- STATEMENTS
- PUBLICATIONS

### 構築完了まで保持

旧OCOS系DBは2026-10-04に `旧OCOS Source DBs｜監査完了まで保持` へ集約した。

- 旧 Listener Mail DB
- 旧 Master Episode DB
- 旧 Master Schedule DB
- 旧 Member DB
- 旧 Master Music DB
- 旧 Master History DB
- 旧 Concert/Setlist DB
- OCOS V5 Cockpit

これらはRelationで相互接続された旧システム群であり、個別に削除しない。現行HHA/OC-OSへ未移行の固有情報がないことを確認後に、履歴保存または削除へ判定する。

`Location DB` は地図ブロックをAPIで完全確認できていないため、現時点では移動・削除せず保留。

### 削除候補

- 2026-09-06作成のタイトルなし空ページ — 内容なし。参照確認後に削除可。

## 9. Google Drive

### 継続利用

- `OC-OS/EPISODES/`
- `おひさまコネクト_CRAWLER_LEDGER`
- `HHA_Hinatazaka46_Historical_Archive` — HHA資産として必要

### 構築完了まで保持 / 用途確認中

- `HHA_Member_Watcher` — Raw_SnapshotsをHHA Member Maintenance CURRENT / PILOTで再利用。2026-10-05 Raw Snapshot保存Pilot成功。継続安定運用確認まで保持
- `Hinatazaka_Personal_Archive` — BLOG / BLOBS / INDEXあり。現行処理との接続・由来確認待ち

HHA関連資産は必要性とOC-OS直下に置くべきかを分けて判断する。物理移動を行う場合はFolder ID依存を監査する。

### 削除候補

- 空の `OC-OS/TEMPLATES` — 今後Template方式を採用しないと確定すれば削除
- EPISODE配下の `.venv`, `Lib`, `Scripts`, `Include`, `pyvenv.cfg` — ローカル実行環境の再構築確認後に除去
- 同一回の古いSTUDIO PACK中間生成版 — 実際に使用した最終版・必要証拠を確定後に整理
- 再生成可能な一時ファイル

## 10. 整理原則

```text
必要だから残す
    ≠
古いから残す

履歴を残す
    ≠
main branch / Production Runtimeへ置き続ける

構築中に使う
    ≠
完成後も永久に残す
```

削除を急がないが、単なる隔離を最終目的にもしない。

**各資産について、今後必要になる具体的理由があるかを確認し、役割終了が確認できたものは整理する。**

## 11. 次の監査順

1. GitHub ONE-OFF群の実行結果証拠を確認し、削除可能群を確定する。
2. Drive `.venv` とSTUDIO PACK中間版の依存を確認する。
3. HHA_Member_Watcher / Hinatazaka_Personal_Archiveの現行用途を確定する。
4. 旧OCOS Source DB群に現行HHA/OC-OS未移行の固有情報がないか監査する。
5. 条件を満たした削除候補だけを実際に削除する。
