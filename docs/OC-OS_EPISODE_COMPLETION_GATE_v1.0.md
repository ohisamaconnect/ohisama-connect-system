# OC-OS EPISODE Completion Gate v1.0

基準日: 2026-09-26

## 1. 目的

EPISODESの `アーカイブ処理済` と `完了` を、単なる気分や日付経過ではなく「その回について残すべき内部記録が揃ったか」で判断できるようにする。

Completion Gateは**判定材料を表示するだけ**であり、Production_Statusを自動変更しない。

## 2. Status Semantics

### 収録済

実際の収録が完了した状態。

収録内容・STUDIO ITEMSの実績確定や後処理はまだ残っていてよい。

### 放送済

FMでの本放送が完了した状態。

外部公開物の完成・公開は必須ではない。

### アーカイブ処理済

その回を後から再確認するための**内部Canonical記録**が揃った状態。

### 完了

内部アーカイブに加え、その回から派生した人間確認タスクが解消された状態。

## 3. Archive Gate

`アーカイブ処理済` の判断材料:

### 必須

```text
Audio_URL           が存在
Transcript_URL      が存在
STUDIO ITEMS        に「候補」が残っていない
Episode Actuals     使用済に由来するEvents/Songs/Sourcesの不足Relationがない
Structure_Memo      実際の番組構成が記録済み
Setlist_Memo        実際の曲順・役割が記録済み
```

### 補足

- `Audio_URL` はCanonical MASTERへの参照。
- `Transcript_URL` は正式Google Docへの参照。
- `保留 / 見送り` は未処理ではない。人間が判断済みの結果として扱う。
- MESSAGEはEPISODE→STUDIO ITEMS→MESSAGEで追跡できるため、EPISODESへの直接Relationを必須にしない。
- Episode_Title / Episode_No / Public_URL はArchive Gate必須条件にしない。

## 4. Completion Gate

`完了` の判断材料:

まずArchive Gateが満たされていること。

そのうえで:

```text
STATEMENTS
  Review_Status = 候補 が0件

PUBLICATIONS
  未着手 / 下書き / 確認待ち / 公開準備済 が0件
```

PUBLICATIONSは0件でもよい。

公開物を作らない判断も正常であり、作成済みPublicationを `見送り` にすれば解決済みとする。

`公開済` のPUBLICATIONには原則として `Public_URL` と `Published_At` を残す。

## 5. What Is NOT Required

以下を完了条件にしない。

- noteを必ず公開すること
- SNS投稿を必ず行うこと
- Spotifyへ必ず公開すること
- STATEMENTSを必ず1件以上確定すること
- Episode_Titleを必ず付けること
- リスナー反応を収集すること

0件・見送りは正常な結果である。

## 6. Human Authority

Completion Gateが `ready = true` でも、GASはProduction_Statusを変更しない。

最終的に

```text
放送済 → アーカイブ処理済
アーカイブ処理済 → 完了
```

へ進めるのはあさくらじゅんの判断とする。

## 7. Implementation

```text
gas/oc_os_episode_completion_gate_v0.1.0.gs
```

実行関数:

```text
previewEpisodeCompletionGateV01()
```

書込みなし。

`OC_TARGET_EPISODE_KEY` がある場合は明示対象を使う。

## 8. Principle

完了とは「すべてを公開した」ことではなく、**その回について後から困らないだけの記録と、人間が判断すべき保留事項の整理が終わったこと**である。

公開を制作義務にせず、内部アーカイブと外部発信を分離する。