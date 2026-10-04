# OC-OS Component Registry v1.0

基準日: 2026-10-04

## 1. 目的

OC-OSの構築では、現行Production、まだPilot中の機能、診断・構築補助、過去の試作・移行用コードが同じGitHub履歴に存在する。

この文書は「あさくらじゅんが普段使うもの」と「構築・保守のためだけに残すもの」を分離し、誤って旧コードをApps Scriptへ再導入することを防ぐための入口である。

上位原則はProject Canonical Principles、週次運用の正本は `docs/OC-OS_WEEKLY_STANDARD_OPERATION_v1.0.md` とする。

## 2. Statusの意味

| Status | 意味 | 日常運用 |
|---|---|---|
| CURRENT / PRODUCTION | 毎週の標準運用で使う現行系 | 残す・使う |
| CURRENT / PILOT | 完成形に必要だが本運用確認が残る現行系 | 残す・必要時に検証 |
| SUPPORT / DIAGNOSTIC | 構築・監査・障害時に必要 | GitHubに残す。日常画面には出さない |
| LEGACY / HISTORY | 設計履歴・比較・回帰確認用。現行Runtimeでは使わない | GASへ新規導入しない・Triggerを付けない |
| ONE-OFF / MIGRATION | Backfill、Cleanup、競合解消等の一度きりの処理 | GitHub履歴に残すが通常Runtimeへ置かない |

**コードがRuntimeに存在すること、GASへ導入済みであること、実データPilotに成功したこと、継続安定運用できていることは別の状態として扱う。**

## 3. CURRENT / PRODUCTION — 毎週残す中核

2026-10-04 Runtime ValidationでCore Production Runtime Confirmedとなった系統。

### INBOX

- `gas/ohisama_inbox_crawler_v1.2.8_revision_chain_production_runner.gs`
- `gas/ohisama_inbox_crawler_v1.2.6` — v1.2.8 Runnerが利用するBase
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

Form→MESSAGESは実装・稼働記録がある。Gmail routeは下記Pilotへ分ける。

### Local transcription

正式Contractは `docs/OC-OS_TRANSCRIPT_ARTIFACT_CONTRACT_v1.0.md`。

- CURRENT ASR entry: `transcription/transcribe_episode_v0.4.1.py`
- Base dependency: `transcription/transcribe_episode_v0.4.0.py`
- Grounded cleanup: `transcription/hha_clean_transcript.py`
- Terms: `transcription/hha_transcription_terms.json`, `transcription/oc_transcription_terms.json`
- Environment definition: `transcription/requirements.txt`

`.venv`本体は再生成可能なローカル実行環境であり、EPISODE成果物ではない。DriveのEPISODE/TRANSCRIPTには置かない。

## 4. CURRENT / PILOT — 完成形に必要なのでまだ残す

以下は現行設計であり、Legacyではない。ただし2026-10-04時点では別Pilotまたは日常運用確認が残る。

### MESSAGES Gmail route

- `gas/oc_os_messages_gmail_preview_v0.1.2.gs`
- `gas/oc_os_messages_gmail_sync_v0.1.0.gs`

本番Runtimeでモジュールの存在は確認済み。ただし実メールを用いた取込成功の確認とは別なので、実地確認が終わるまではPilot扱いとする。

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

### Calendar

- `docs/OC-OS_CALENDAR_INTEGRATION_v1.0.md`
- `gas/oc_os_episode_calendar_sync_v0.1.0.gs`

Google Calendar自体の収録・本放送・再放送予定は実用中。ここで残るPilotは、EPISODESとの同期とEvent ID記録を実データで確認する工程。

### Weekly UI / next-week handoff

- `docs/OC-OS_WEEKLY_CONTROL_CONTRACT_v1.0.md`
- `docs/OC-OS_WEEKLY_CYCLE_HANDOFF_CONTRACT_v0.1.md`
- `gas/oc_os_weekly_review_queue_resolver_v0.1.0.gs`

Weekly Controlの考え方は残す。2026-10-04用Pilot画面を永久UIに固定せず、次週切替の実運用確認後にCurrent Week UIとして整理する。

## 5. SUPPORT / DIAGNOSTIC — 残すが、あさくらの日常操作から隠す

- `gas/oc_os_gas_runtime_audit_v0.1.0.gs`
- `gas/oc_os_episode_lifecycle_auditor_v0.1.0.gs`
- `gas/oc_os_episode_completion_gate_v0.1.0.gs`
- `gas/oc_os_weekly_readiness_report_v0.1.0.gs`
- `docs/OC-OS_GAS_DEPLOYMENT_INVENTORY_v1.0.md`
- `docs/OC-OS_EPISODE_LIFECYCLE_AUDIT_v1.0.md`
- `docs/OC-OS_EPISODE_COMPLETION_GATE_v1.0.md`
- `docs/OC-OS_WEEKLY_READINESS_v1.0.md`
- 日付付きRuntime Validation / Audit記録

これらは障害切り分け、変更後の監査、引継ぎには重要だが、毎週の制作画面で本人が操作する対象ではない。

## 6. LEGACY / HISTORY — GitHubに残してよいがRuntimeへ戻さない

現行Registryは `docs/OC-OS_ACTIVE_LEGACY_MODULES_v1.0.md` を参照。

明示Legacy:

- `gas/oc_os_calendar_bridge_v0.1.0.gs`
- `docs/OC-OS_CALENDAR_CONTRACT_v1.0.md`
- `gas/oc_os_publication_plan_seeder_v0.1.0.gs`
- `gas/HHA_Legacy_OCOS_Snapshot_v1_1.gs`
- 旧OCOS V5系 `00_Config`, `10_Crawlers`, `20_Logic`, `30_Utils` など（現行依存がないことを確認した上でRuntimeから隔離）
- Crawlerの旧版 v1.1.x / v1.2.0〜v1.2.5、v1.2.7検証系
- Processor旧Trigger・テスト系
- `transcription/transcribe_episode.py` — v0.3.0。正式ContractのCurrent entryではない
- 古いTranscription Pilot説明・検証手順（履歴としてのみ保持）

Legacyは削除必須ではない。GitHubは履歴保管場所として残してよいが、Currentと同じ意味で `gas/` 直下に見えること自体は将来の誤導入リスクになるため、後続整理で `legacy/` への移動を検討する。

## 7. ONE-OFF / MIGRATION — 再実行を通常運用にしない

以下のような構築時だけの処理は、結果の証拠としてGitHubに残すが、通常Runtimeには配置しない。

- INBOX duplicate cleanup
- deterministic backfill
- manual conflict M02812 / M02813
- parent backfill
- revision observation type stage / preview / commit
- AI suggestion staged commit / revision guardの過去段階
- 各種preview-only / dry-run

再利用が必要になった場合は、その時点のCanonical Contractと現行Schemaに適合するか再監査してから使う。

## 8. Notionの整理方針

### 日常的に見せる

- Current Week / Weekly Control
- EPISODE
- STUDIO ITEMS
- INBOX Review Queue
- 必要時のみ MESSAGES / STATEMENTS / PUBLICATIONS

### DBとして残すが普段は直接見なくてよい

- INBOX
- SOURCES
- EVENTS
- EPISODES
- STUDIO ITEMS
- MESSAGES
- STATEMENTS
- PUBLICATIONS

### Legacy / 構築資料へ移す候補

- 旧 `Master Episode DB`
- 旧 `Master Schedule DB`
- 旧 `Member DB`
- 旧 `Master Music DB`
- 旧 `Master History DB`
- 旧 `Concert/Setlist DB`
- 旧 `Location DB`
- `OCOS V5 Cockpit`
- 旧 `Listener Mail DB`
- 旧 `今週の制作`（現行Weekly Controlと役割重複）
- 日付付きGAS Deployment Inventory等の構築チェックページ

Legacy DBはCanonical移行元ではない。参照価値があるため、削除より先に一箇所へ隔離する。

現在の親ページはCore Production Runtime Confirmed後の実態に合わせて `OC-OS｜制作基盤` を使用する。

## 9. Google Driveの整理方針

### 残す

```text
OC-OS/
  EPISODES/
    YYYY-MM-DD/
      STUDIO/
      AUDIO/
        MASTER/
        TRANSCRIPTION_PROXY/
        SPEECH_STEM/
      TRANSCRIPT/
        正式Google Doc 1件
        MACHINE/
```

### STUDIO Pack

Studio Packは正本ではない。収録前は最新版を使い、収録後は「実際に持ち込んだ最終スナップショット」を1系統残せればよい。生成途中の複数Timestamp × HTML/PDF/Google Docを日常表示に残し続ける必要はない。

### Driveから外す

- `.venv`、`Lib`、`Scripts`、`Include`、`pyvenv.cfg` 等のPython仮想環境
- 再生成可能な一時ファイル
- 同一用途の旧生成Pack（必要ならGENERATED_HISTORYへ隔離）

### OC-OSとは別領域として扱う

- HHA
- Personal Archive
- HHA Member Watcher

これらは必要だが、OC-OS週次制作の必須操作対象ではない。物理移動はFolder ID依存を監査してから行う。

## 10. あさくらじゅんが普段覚えるもの

日常運用では次の4点だけを入口として理解すればよい。

1. **Notion Current Week** — 今週見る画面
2. **EPISODE** — 放送回の記録
3. **Drive EPISODE folder** — 音源・Transcript・Studio Packの実体
4. **Calendar** — いつ収録・放送・締切があるか

GitHub、GAS、Runtime Audit、Migration scriptsは「裏側」。通常はChatGPT等の構築・監査側が見る。

## 11. 次の整理順

1. NotionのCurrent UIとLegacy UIを分離する。
2. Driveの`.venv`とStudio Pack世代を整理する。
3. GitHubのLegacy / One-offを物理フォルダ分離する前に依存参照を監査する。
4. MESSAGES Gmail routeを実メールでPilotする。
5. STATEMENTSを実回でPilotする。
6. PUBLICATIONS / Public Talk Audioを必要な回だけPilotする。
7. Calendar Syncを実EPISODEで確認する。
8. Weekly Controlの次週切替を確認し、`Current Week`入口を固定する。

削除よりも先に「Currentから見えなくする」「再導入されない状態にする」ことを優先する。
