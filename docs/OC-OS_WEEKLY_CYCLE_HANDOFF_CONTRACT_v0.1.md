# OC-OS Weekly Cycle Handoff Contract v0.1

基準日: 2026-09-29
状態: STAGE / Pilot中

## 1. Purpose

Weekly Episode Bootstrap と Weekly Review Queue Resolver の接続順序と、人間確認を挟む境界を定義する。

この契約は新しいCanonical DBを作らない。EPISODES / INBOX / saved Views / Drive の既存正本をつなぐ運用契約である。

## 2. Canonical Handoff

```text
Current EPISODE
↓
水曜収録
↓
Production_Status = 収録済
  ※人間判断
↓
previewWeeklyEpisodeBootstrapV01()
  ※READ ONLY
↓
人間確認
↓
createNextWeeklyEpisodeV01()
  ※Next EPISODE + Drive skeleton を作成
↓
previewWeeklyReviewQueueResolverV01()
  ※READ ONLY
↓
Previous Recording_Date → Current Recording_Date
のReview Windowを確認
↓
人間確認
↓
syncWeeklyReviewQueueResolverV01()
  ※必要な4 saved ViewのDetected_At境界だけ同期
↓
Weekly Controlで次週制作開始
```

## 3. Layer Responsibilities

### Weekly Episode Bootstrap

責務:
- 次週EPISODEの器を作る
- Air_Date / Recording_Date / Episode_Key を確定する
- Drive episode folder skeleton を作る

責務外:
- Review Queue期間を変更する
- INBOXの採否を判断する
- Weekly Controlを自動切替する
- Review Queue Resolverを自動Commitする

### Weekly Review Queue Resolver

責務:
- 現在のActive EPISODEのRecording_DateをCurrentとして取得する
- 直前EPISODEのRecording_DateをPreviousとして取得する
- `Previous <= Detected_At <= Current` のinclusive Windowを解決する
- Weekly Controlで使う4 saved ViewのDetected_At境界だけを同期する

責務外:
- EPISODEを作成する
- Production_Statusを変更する
- INBOX rowを更新する
- 話題採用を判断する
- Weekly Controlページ自体を自動生成・差替えする

## 4. Human Gates

OC-OS原則に従い、以下の2か所に明示的な人間確認を残す。

### Gate A — Next EPISODE creation

```text
previewWeeklyEpisodeBootstrapV01()
↓
あさくらじゅん確認
↓
createNextWeeklyEpisodeV01()
```

### Gate B — Review Window sync

```text
previewWeeklyReviewQueueResolverV01()
↓
あさくらじゅん確認
↓
syncWeeklyReviewQueueResolverV01()
```

BootstrapのWRITE成功を理由にResolverのWRITEを自動実行してはならない。

## 5. Trigger Policy during Pilot

2026-10-04 End-to-End Production Pilotが完了するまでは、以下を自動化しない。

- `installWeeklyEpisodeBootstrapTriggerV01()` の有効化
- Review Queue ResolverのWRITEトリガー
- Bootstrap → Resolver の直接チェーン
- Weekly Controlページの毎週自動生成・対象EPISODE自動差替え

Pilot中は手動Preview → 人間確認 → 手動CommitをCanonical運用とする。

## 6. Current Pilot Exception

初回Pilot:

```text
Episode_Key     2026-10-04
Recording_Date  2026-09-30
Air_Date        2026-10-04
```

初回は前回EPISODEがOC-OSに存在しないため、承認済みBootstrap Anchorとして `2026-09-23` を使用する。

```text
Review Window = 2026-09-23 ～ 2026-09-30 inclusive
```

このBootstrap Anchorは初回Pilot専用であり、将来の欠落EPISODEに対する自動 `-7日` 推測ルールにはしない。

## 7. First Natural Write Pilot

Resolver v0.2.0は以下まで実地確認済み。

- Previewで4 ViewすべてREADY
- Property ID `wmfI` としてDetected_Atを一意に識別
- 現在Windowと一致する場合、Syncは4 Viewすべて `SKIP_ALREADY_CURRENT`
- `writeCount = 0`
- `warnings = []`

未検証なのは、自然に次週EPISODEへ移行して `wouldChange = true` となったときの実PATCH経路のみ。

この確認は本番Viewを故意に誤設定して行わず、次週EPISODEが自然に生成された最初の週で行う。

期待例:

```text
Previous Recording_Date = 2026-09-30
Current Recording_Date  = 2026-10-07
Review Window            = 2026-09-30 ～ 2026-10-07 inclusive
```

このとき:

```text
Preview
↓
4 View wouldChange = true
↓
人間確認
↓
Sync
↓
PATCH
↓
再GET
↓
VERIFIED
```

を確認する。

## 8. Weekly Control Boundary

Weekly Controlは司令塔UIであり正本ではない。

2026-10-04 Pilot中は対象EPISODEを固定し、自動で次週へ切り替えない。

Weekly Controlページの毎週生成・差替え自動化は、2026-10-04回のEnd-to-End Pilot後に使い勝手を評価した上で、別Stageとして判断する。

## 9. Failure Principle

Bootstrap、Resolver、Weekly Controlのいずれが停止しても、水曜日の収録は成立しなければならない。

システムは番組制作を支援するものであり、収録の成立条件にはしない。
