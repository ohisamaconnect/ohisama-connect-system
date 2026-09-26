# OC-OS Weekly Episode Bootstrap v1.0

基準日: 2026-09-26

## 1. 目的

毎週の制作開始時に、次回EPISODEとDriveの回フォルダを安全に準備する。

この工程は「番組内容を作る」ものではなく、次の制作サイクルの器だけを作る。

## 2. Canonical Cadence

通常週は以下を機械的な日付関係として扱う。

```text
Air_Date       = 日曜日
Recording_Date = Air_Date - 4日 = 水曜日
Episode_Key    = Air_Date の yyyy-MM-dd
```

次回日付はカレンダー上の「次の日曜」を現在日時から推測するのではなく、**最新の既存EPISODE Air_Date + 7日** から導く。

これにより、システム導入開始時点や例外週の現在日時から過去・未来を勝手に補完しない。

## 3. Creation Gate

`Production_Status = 準備中 / 収録準備済` のEPISODEが1件存在する場合、新規EPISODEを作らない。

0件の場合のみ、最新EPISODEを基準に次週を提案する。

2件以上の場合はBLOCKし、人間確認を求める。

この設計により、収録後に現在回を `収録済` へ進めた後から、次週EPISODEを用意できる。

## 4. New EPISODE Initial State

新規EPISODEで自動設定してよいもの:

```text
Episode_Key
Air_Date
Recording_Date
Production_Status = 準備中
Episode_Folder_URL
```

自動設定しないもの:

```text
Episode_No
Episode_Title
Events / Songs / Sources
Studio_Items
Audio_URL
Transcript_URL
Structure_Memo
Setlist_Memo
Public_URL
Statements
Publications
```

`Episode_No` は実際の放送回数を推測・自動採番しない。

## 5. Drive Skeleton

Canonical EPISODES root:

```text
EPISODES/
```

次回作成時:

```text
EPISODES/
  YYYY-MM-DD/
    STUDIO/
    AUDIO/
      MASTER/
      TRANSCRIPTION_PROXY/
      SPEECH_STEM/
    TRANSCRIPT/
      MACHINE/
```

同名Episode folderが1件存在する場合は再利用する。

2件以上存在する場合は停止する。

Drive folder作成後にNotion APIが失敗しても、再実行で既存folderを再利用して復旧できる設計とする。

## 6. Implementation

```text
gas/oc_os_weekly_episode_bootstrap_v0.1.0.gs
```

Read only:

```text
previewWeeklyEpisodeBootstrapV01()
```

Write:

```text
createNextWeeklyEpisodeV01()
```

Optional trigger installer:

```text
installWeeklyEpisodeBootstrapTriggerV01()
```

Triggerは初期Pilot中に自動設置しない。導入判断後に明示的に有効化する。

## 7. Relationship to STUDIO Automation

```text
Current EPISODE
↓ 収録
Production_Status = 収録済（人間判断）
↓
Weekly Episode Bootstrap
↓
Next EPISODE = 準備中
↓
Candidate Seeder
↓
STUDIO ITEMS = 候補
↓
Studio Pack
↓
次の水曜収録
```

BootstrapはCandidate Seederより前の層である。

## 8. Principle

Weekly Episode Bootstrapは「次に話す内容」を決めない。

作るのは器だけであり、候補収集・採用判断・話す内容・選曲の最終判断は既存のOC-OS原則に従う。

Bootstrapが失敗しても、手動でEPISODEを作るか、最終的にはシステムなしで水曜収録を行える。