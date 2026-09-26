# OC-OS Active / Legacy Modules Registry v1.0

基準日: 2026-09-26

## 1. 目的

OC-OSでは構築途中の試作・後発改良が同じGitHub履歴に残る。

この文書は、**現在のPilotで実行する系統**と、**履歴として残すが実行しないLegacy系統**を明示し、二重WRITEを防ぐための運用レジストリである。

GitHubにファイルが存在することは、そのファイルが現行Production候補であることを意味しない。

---

## 2. Calendar

### CURRENT

Contract:

```text
docs/OC-OS_CALENDAR_INTEGRATION_v1.0.md
```

Code:

```text
gas/oc_os_episode_calendar_sync_v0.1.0.gs
```

Handlers:

```text
previewEpisodeCalendarSyncV01()
syncEpisodeCalendarV01()
```

Canonical source:

```text
EPISODES.Recording_Date
EPISODES.Air_Date
```

Mirror output:

```text
Recording = all-day marker
Air       = 19:30 / default 28 min
```

EPISODES stores:

```text
Recording_Calendar_Event_ID
Air_Calendar_Event_ID
Calendar_Synced_At
```

再放送は初期Sync対象外。必要になった時点で、再放送時刻のCanonical sourceを決めてから追加する。

### LEGACY

```text
docs/OC-OS_CALENDAR_CONTRACT_v1.0.md
gas/oc_os_calendar_bridge_v0.1.0.gs
```

旧仕様:

```text
Recording = 21:00–21:15 marker
Air       = 19:30–19:58
Repeat    = 翌日20:00–20:28
create-missing-only
```

Legacy WRITE:

```text
syncEpisodeCalendarBridgeV01()
```

はコード上で停止済み。

**Calendar PilotではCURRENT系だけを使用する。**

---

## 3. PUBLICATIONS

### CURRENT

Contract:

```text
docs/OC-OS_PUBLICATIONS_CONTRACT_v1.0.md
```

Current draft pipeline:

```text
Official Transcript
+ EPISODE Actuals
+ Confirmed STATEMENTS
        ↓
Publication Context Pack
        ↓
AI Draft JSON
        ↓
previewPublicationDraftImportV01()
        ↓
importPublicationDraftsV01()
        ↓
PUBLICATIONS = 下書き
        ↓
Human Review
```

Current Code:

```text
gas/oc_os_publication_context_builder_v0.1.0.gs
gas/oc_os_publication_draft_importer_v0.1.0.gs
```

Identity:

```text
Publication_Key = <Episode_Key>|<Output_Type>|<Platform>
```

原則:

- 実際に作る公開物だけを作成する。
- 公開物0件の回も正常。
- 既存Publication_KeyをAI再生成で自動更新しない。
- AIは公開準備済・公開済へ進めない。

### LEGACY

```text
gas/oc_os_publication_plan_seeder_v0.1.0.gs
```

旧Identity:

```text
PUBPLAN|<Episode_Key>|<slot>
```

旧Seederは毎週、トーク音声・ショーノート・SNS・オーディオグラムの定型枠を先に作成する案だった。

現行では不要な作業枠を増やし、Draft ImporterとKey体系も一致しないため採用しない。

Legacy WRITE:

```text
seedPublicationPlanV01()
```

はコード上で停止済み。

**PUBLICATIONS PilotではDraft Importer系だけを使用する。**

---

## 4. Legacy Handling Rule

Legacyコードは設計経緯・比較・回帰確認のためGitHubに残してよい。

ただし:

- 新規GAS導入対象にしない。
- Triggerを付けない。
- WRITEを実行しない。
- 現行モジュールと同時運用しない。
- Legacyの存在を理由に、現行Contractを曖昧にしない。

すでにApps ScriptプロジェクトへLegacyファイルがコピー済みの場合は、削除または無効化を人間が確認する。ChatGPT/GitHub上の変更だけでは、既存Apps Scriptプロジェクトのファイルは自動更新されない。

---

## 5. Promotion Rule

新しい試作が現行モジュールを置き換える場合は、先に以下を行う。

1. 新旧の責務・Identity・Write範囲を比較する。
2. 現行にする系統を1つ選ぶ。
3. Contractを更新する。
4. 旧系統をLegacy Registryへ移す。
5. 旧WRITEを停止する。
6. Apps Script実環境で導入版を確認する。
7. 実データPilot後にProduction扱いへ昇格する。

「新しいコードがGitHubにある」だけでは現行化しない。

---

## 6. Current Decision Summary

```text
Calendar
CURRENT : oc_os_episode_calendar_sync_v0.1.0.gs
LEGACY  : oc_os_calendar_bridge_v0.1.0.gs

PUBLICATIONS
CURRENT : oc_os_publication_draft_importer_v0.1.0.gs
LEGACY  : oc_os_publication_plan_seeder_v0.1.0.gs
```

この決定は、2026-10-04 End-to-End Pilotに適用する。
