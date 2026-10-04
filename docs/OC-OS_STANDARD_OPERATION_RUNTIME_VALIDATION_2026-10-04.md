# OC-OS Standard Operation v1.0 Runtime Validation — 2026-10-04

基準日: 2026-10-04

対象: `docs/OC-OS_WEEKLY_STANDARD_OPERATION_v1.0.md`

## 1. 目的

第118回End-to-End Pilotから昇格したOC-OS標準運用 v1.0について、Target Episode Safety Lock、Weekly Episode Bootstrap、本番Apps Script Runtime Inventoryを実データで検証した証拠を残す。

本書の最終判定は以下とする。

```text
OC-OS Standard Operation v1.0
Core Production Runtime Confirmed
```

## 2. Target Lock Manager Runtime Validation

対象モジュール:

```text
gas/oc_os_target_episode_lock_manager_v0.1.0.gs
```

### 2.1 Initial Preview

`previewTargetEpisodeLocksV01()` を実行。

結果:

```text
POST_RECORDING
  proposed = 2026-10-04
  Production_Status = 収録済
  candidateCount = 1
  safeToLock = true
  warnings = []

PRE_RECORDING
  candidateCount = 0
  safeToLock = false
```

PRE_RECORDINGが0件のためLock不可となることを確認。

### 2.2 Wrong-phase Safety Stop

次週EPISODE作成前に `lockPreRecordingTargetV01()` を実行。

結果:

```text
Error: Target lock is not safe.
```

PRE_RECORDING候補がない状態でWrite Safety Lockが設定されないことを実証した。

### 2.3 POST_RECORDING Lock

`lockPostRecordingTargetV01()` を実行。

結果:

```text
write = TARGET_EPISODE_LOCK_SET
OC_TARGET_EPISODE_KEY = 2026-10-04
OC_TARGET_EPISODE_LOCK_MODE = POST_RECORDING
```

旧手入力状態の `OC_TARGET_EPISODE_KEY=2026-10-04` から、Lock Manager管理状態へ正常移行した。

### 2.4 Clear Lock

`clearTargetEpisodeLockV01()` を実行。

結果:

```text
write = TARGET_EPISODE_LOCK_CLEARED
current.episodeKey = ""
current.mode = ""
current.lockedAt = ""
```

Target Lock Managerが所有する3プロパティだけを安全に解除できることを確認した。

## 3. Weekly Bootstrap Runtime Validation

`previewWeeklyEpisodeBootstrapV01()` を実行。

結果:

```text
action = CREATE_NEXT_EPISODE
Episode_Key = 2026-10-11
Recording_Date = 2026-10-07
Air_Date = 2026-10-11
Production_Status = 準備中
matchingEpisodeFolderCount = 0
warnings = []
```

Human Gate確認後、`createNextWeeklyEpisodeV01()` を実行。

作成結果:

```text
Notion EPISODE
  Episode_Key = 2026-10-11
  Recording_Date = 2026-10-07
  Air_Date = 2026-10-11
  Production_Status = 準備中

Drive
  2026-10-11/
    STUDIO/
    AUDIO/
      MASTER/
      TRANSCRIPTION_PROXY/
      SPEECH_STEM/
    TRANSCRIPT/
      MACHINE/
```

Episode_No、内容、曲、MESSAGE、構成をBootstrapが推測・確定しないことも維持された。

## 4. PRE_RECORDING Lock Runtime Validation

次週EPISODE作成後、`previewPreRecordingTargetLockV01()` を実行。

結果:

```text
mode = PRE_RECORDING
proposed = 2026-10-11
candidateCount = 1
safeToLock = true
warnings = []
```

Human Gate確認後、`lockPreRecordingTargetV01()` を実行。

結果:

```text
write = TARGET_EPISODE_LOCK_SET
OC_TARGET_EPISODE_KEY = 2026-10-11
OC_TARGET_EPISODE_LOCK_MODE = PRE_RECORDING
```

これにより、毎週Apps Script Project Settingsで `OC_TARGET_EPISODE_KEY` を手入力する必要はなくなった。

## 5. Runtime-confirmed Target Rule

標準運用では以下を採用する。

```text
Script PropertiesへEpisode_Keyを毎週手入力しない
↓
フェーズ別Target Preview
↓
Human Gate
↓
Target Lock ManagerがOC_TARGET_EPISODE_KEYを設定
↓
既存モジュールが同じSafety Lockを利用
```

また、同じ時点で

```text
POST_RECORDING = 今週収録済回
PRE_RECORDING  = 次週準備中回
```

が別EPISODEとして併存できることを実データで確認した。

## 6. GAS Runtime Inventory v0.1.2 Validation

`reportGasRuntimeInventoryV01()` v0.1.2-preview を本番Apps Scriptで実行。

結果:

### Current production runner / base

```text
INBOX Crawler
  CURRENT / v1.2.8 RUNNER
  present = true
  versionHint = 1.2.8

INBOX Crawler Base
  CURRENT DEPENDENCY / v1.2.6
  present = true

INBOX Processor
  CURRENT / v0.1.2 READY-ONLY
  present = true
  versionHint = 0.1.2-ready-only

INBOX Processor Base
  CURRENT DEPENDENCY / v0.1
  present = true
```

### OC-OS weekly-production modules

以下はすべて `present = true` を確認した。

```text
STUDIO Automation
MESSAGES Form Sync
MESSAGES Gmail Preview
MESSAGES Gmail Sync
Weekly Episode Bootstrap
Target Episode Lock Manager
Episode Actuals Finalizer
Post-Recording Intake
Transcript Materializer
Post-Recording Integrator
STATEMENTS Candidate Importer
Publication Context Builder
Publication Draft Importer
Calendar Sync
Lifecycle Auditor
Completion Gate
Weekly Readiness
```

### Legacy exclusion

```text
Calendar Bridge legacy        present = false
PUBLICATIONS Plan Seeder      present = false
```

旧WRITE handlerが本番Runtimeに存在しないことを確認した。

### Current production triggers

```text
runFrequentCrawlerV128 = 1
runScheduleCrawlerV128 = 1
runDailyCrawlerV128    = 1
runInboxProcessorV012  = 1
```

Crawler / Processorの現行Production Runnerに重複Triggerなし。

その他、STUDIO / MESSAGE / HHA監査系Triggerが同一project内に存在することもRuntime Inventoryで確認した。

### Script Properties

Target Lockに必要な以下3項目が存在する。

```text
OC_TARGET_EPISODE_KEY       = present
OC_TARGET_EPISODE_LOCK_MODE = present
OC_TARGET_EPISODE_LOCKED_AT = present
```

Notion tokenも利用可能状態。

Calendar関連の任意Property:

```text
OC_CALENDAR_ID
OC_AIR_START_TIME
OC_AIR_DURATION_MIN
```

は未設定だが、今回のCore Standard Operation Runtime判定のCritical要件ではない。

### Final Audit result

```text
missingCritical = []
warnings = []
```

## 7. Validation Status

```text
Target Lock Manager GitHub implementation          PASS
Target Lock Manager GAS deployment                 PASS
POST_RECORDING preview                              PASS
Wrong-phase safety stop                             PASS
POST_RECORDING lock                                 PASS
Lock clear                                          PASS
Weekly Bootstrap preview                            PASS
Weekly Bootstrap write                              PASS
PRE_RECORDING preview                               PASS
PRE_RECORDING lock                                  PASS
Manual OC_TARGET_EPISODE_KEY weekly input removal  PASS
Runtime Audit v0.1.2 deployment                     PASS
Crawler v1.2.8 runtime detection                    PASS
Processor v0.1.2 runtime detection                  PASS
Core OC-OS module presence                          PASS
Current crawler/processor trigger uniqueness        PASS
Legacy WRITE handler exclusion                      PASS
Critical Script Property presence                   PASS
missingCritical = []                                PASS
warnings = []                                       PASS
```

## 8. Final Promotion Decision

2026-10-04時点で、以下を正式に採用する。

```text
第118回 End-to-End Pilot
        ↓
Pilotで発見した改善点を反映
        ↓
OC-OS Weekly Standard Operation v1.0
        ↓
Target Lock / Bootstrap Runtime Validation
        ↓
GAS Runtime Inventory v0.1.2 Validation
        ↓
CORE PRODUCTION RUNTIME CONFIRMED
```

したがって、以後の通常制作では第118回を「特別なPilot」として再現するのではなく、`OC-OS Weekly Standard Operation v1.0` を毎週の基準運用とする。

ただし、これはOC-OS全機能が完成したという意味ではない。

引き続き別Pilot対象として残るものには、PUBLICATIONS、STATEMENTSの本運用、Calendarの実運用、その他の派生公開処理などがある。

Core production flowについてはProduction Confirmedとする。
