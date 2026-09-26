# OC-OS Weekly Readiness Report v1.0

基準日: 2026-09-26

## 1. 目的

一人制作でモジュールが増えても、「今週の回がどこまで進んでいるか」を複数DB・Driveフォルダから探し回らずに確認できる読み取り専用レポートを持つ。

このレポートは作業判断を代行しない。

## 2. Implementation

```text
gas/oc_os_weekly_readiness_report_v0.1.0.gs
```

実行関数:

```text
reportWeeklyReadinessV01()
```

Notion / Drive / STUDIO ITEMS / Production_Statusへの書込みは行わない。

## 3. 対象EPISODE

`OC_TARGET_EPISODE_KEY` が設定されていれば、そのEPISODEを優先する。

未設定の場合はPreview用途として既存Post-Recording Intakeの近傍Recording_Date選択を利用できる。

明示ターゲットを設定して使うことを推奨する。

## 4. Report Scope

### Episode

```text
Episode_Key
Production_Status
Recording_Date
Air_Date
Studio_Pack_URL
Audio_URL
Transcript_URL
```

### Pre-Recording

```text
Studio Pack有無
STUDIO ITEMS件数
候補 / 使用済 / 保留 / 見送り件数
```

ただし欠落があっても「収録不可」と判定しない。

### Post-Recording

```text
AUDIO/MASTER候補数
TRANSCRIPTION_PROXY候補数
SPEECH_STEM候補数
正式Transcript数
CLEAN_HHA候補数
Audio_URL接続有無
Transcript_URL接続有無
使用済STUDIO ITEM数
```

### STATEMENTS

```text
総件数
候補 / 確定 / 見送り件数
人間確認待ち件数
```

### PUBLICATIONS

```text
総件数
Status別件数
下書き・確認待ち
公開準備済
公開済
```

## 5. Signal Levels

```text
INFO    状態説明
NOTICE  確認するとよいが制作停止条件ではない
REVIEW  人間判断待ち
ACTION  次工程に必要な具体作業がある
```

Signalは自動処理命令ではない。

## 6. Recording Continuity

Readiness Reportは常に次を前提にする。

> Notion/GAS/Drive上の補助工程に欠落があっても、水曜の収録は継続できる。

Studio Packがなくても、Notionが使えるなら通常運用を継続する。

Notionが使えなくても、既存Pack、ローカル保存、最終的には従来どおりシステムなしで収録する。

## 7. Why Read-Only

Readiness Report自身がStatusやデータを修正すると、観測と意思決定が混ざる。

そのため、レポートは状態を集約して表示するだけにし、実際の変更は各責務モジュールまたは人間判断で行う。

## 8. Principle

OC-OSの目的は作業を増やすことではなく、一人制作で「何を確認すればよいか」を明確にすることにある。

Readiness Reportはそのための計器盤であり、番組制作の操縦者ではない。