# OC-OS EPISODE Lifecycle v1.0

基準日: 2026-09-26

## 1. 目的

EPISODES.Production_Statusの意味をOC-OS全体で一意にする。

Statusは制作の「品質評価」ではなく、その回が今どの工程にいるかを示す。

## 2. Canonical Flow

```text
準備中
↓
収録準備済
↓
収録済
↓
放送済
↓
アーカイブ処理済
↓
完了
```

原則として前方向に進む。

例外修正が必要な場合は人間が判断する。AI/GASが自動で過去Statusへ戻したり先へ送ったりしない。

## 3. 準備中

次回EPISODEの器が存在し、候補収集・情報確認・Studio準備を行っている状態。

必要条件:

```text
Episode_Key
Recording_Date
Air_Date
Episode_Folder_URL
```

内容・曲・メール・構成は未確定でよい。

Weekly Episode Bootstrapの新規EPISODEはこの状態から始まる。

## 4. 収録準備済

水曜のスタジオで「あさくらじゅんが判断を始められる」状態。

これは次を意味しない:

- 台本が完成した
- 曲順が確定した
- 話題が確定した
- 読むメールが確定した
- 発言内容が決まった

通常はNotionの今週の制作から候補へアクセスできる。

補助としてStudio Packがあれば望ましいが、Studio Packの存在自体を必須条件にはしない。

## 5. 収録済

実際のスタジオ収録が完了した状態。

ここからPost-Recording工程へ移る。

主な後続:

```text
STUDIO ITEMS実績確定
MASTER保管
Actual Relations
Transcription Pipeline
Formal Transcript
STATEMENTS
PUBLICATIONS
```

収録が終わったという事実を人間が確認してStatusを進める。

## 6. 放送済

FM本放送が完了した状態。

外部公開物が公開済みである必要はない。

再放送が残っていても、本放送完了を基準に `放送済` としてよい。

外部発信とFM放送の工程を混同しない。

## 7. アーカイブ処理済

その回を後から確認・再利用するための内部Canonical記録が揃った状態。

詳細条件は `OC-OS_EPISODE_COMPLETION_GATE_v1.0.md` のArchive Gateを参照する。

主な対象:

```text
Audio_URL
Transcript_URL
Studio判断
Actual Relations
Structure_Memo
Setlist_Memo
```

## 8. 完了

内部アーカイブが完了し、その回から派生した**人間判断待ち**が解消された状態。

主な条件:

```text
STATEMENTS候補 = 0
PUBLICATIONS未処理 = 0
```

公開物は0件でもよい。

公開しないものは `見送り` という人間判断で解決できる。

## 9. Automation Boundary

自動化してよい:

- 各Statusに応じた候補生成
- 必要作業のPreview
- Readiness / Completion Gate
- Drive / Calendar等の補助Artifact作成

自動化しない:

- Production_Statusそのものの前進
- 収録が完了したという判断
- 放送が完了したという判断
- アーカイブが十分という最終判断
- Episodeが完全に終了したという最終判断

Production_Statusはあさくらじゅんが更新する。

## 10. Recording Continuity

どのStatusでも、システム障害を理由に水曜収録を中止する設計にはしない。

`収録準備済` は便利な状態表示であり、「このStatusでなければ収録してはいけない」というGateではない。

## 11. Principle

Statusは人間を縛るワークフローではなく、**一人制作で現在地を見失わないための標識**である。