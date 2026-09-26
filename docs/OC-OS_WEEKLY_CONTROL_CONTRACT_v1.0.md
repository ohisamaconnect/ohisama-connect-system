# OC-OS Weekly Control Contract v1.0

基準日: 2026-09-26

## 1. Purpose

Weekly Controlは、OC-OSの既存Canonical DBとDrive成果物を、1週間の制作単位で一画面にまとめる司令塔UIである。

新しい正本DBではない。各情報の正本はEPISODES / INBOX / STUDIO ITEMS / STATEMENTS / PUBLICATIONS、およびGoogle Drive上の成果物にある。

## 2. Canonical Principle

- Weekly Controlが止まっても水曜日の収録は行えること。
- Dashboardの表示状態を番組制作の成立条件にしない。
- AI/GASが話題採用・使用済判定・STATEMENTS確定・PUBLICATIONS公開判断を自動確定しない。
- 実際に電波に乗ったものが番組の最終成果である。

## 3. Pilot

初期Pilot対象:

```text
Episode_Key   2026-10-04
Recording_Date 2026-09-30
Air_Date       2026-10-04
```

Notion page:

```text
OC-OS｜Weekly Control｜2026-10-04
```

Pilotでは対象EPISODEを固定し、自動で次週へ切り替えない。

## 4. Dashboard Sections

### 1. 今週のEPISODE

EPISODESから対象回を1件表示する。

主表示:

- Episode_Key
- Production_Status
- Recording_Date
- Air_Date
- Studio_Pack_URL
- Audio_URL
- Transcript_URL
- Structure_Memo
- Setlist_Memo

### 2. 収録まで｜STUDIO ITEMS

対象EPISODEにRelationするSTUDIO ITEMSをStudio_Status別Boardで表示する。

`候補 / 使用済 / 保留 / 見送り` の最終判断はあさくらじゅんが行う。

### 3. 情報確認キュー｜INBOX

通常運用開始日 2026-09-24 以降のINBOXから、Statusが `未処理` または `確認中` のものを表示する。

旧バックログをWeekly Controlへ大量表示しない。

### 4. 収録後レビュー｜STATEMENTS

対象EPISODEにRelationし、Review_Status=`候補` のSTATEMENTSだけを表示する。

表示されること自体は確定を意味しない。

### 5. 公開準備｜PUBLICATIONS

対象EPISODEにRelationするPUBLICATIONSをPublication_Status別Boardで表示する。

AI下書きは素材であり、公開可否・最終文面・公開タイミングは人間判断とする。

## 5. Weekly Rhythm

```text
月〜火  INBOX → STUDIO ITEMS
        原典確認・候補選定

水      EPISODE → STUDIO ITEMS
        Studio Pack確認・収録
        Dashboard不調でも収録する

木〜金  EPISODE → Transcript → STATEMENTS
        文字起こし・発言候補確認

土〜日  PUBLICATIONS
        note / SNS / talk audio等の公開準備
```

## 6. Non-goals

Weekly Controlは以下を行わない。

- 新しいCanonicalデータを重複作成する
- Production_Statusを自動変更する
- Studio_Statusを自動確定する
- STATEMENTSを自動確定する
- PUBLICATIONSを自動で公開準備済 / 公開済へ進める
- EPISODES.Public_URLを自動選択する
- 日向坂46予定をHHA Canonicalとして確定する

## 7. Next Step After Pilot

2026-10-04回のEnd-to-End Production Pilot後に、Weekly Control自体の使い勝手を評価する。

評価項目:

1. 水曜収録前に本当に一画面で足りるか
2. INBOX表示量が多すぎないか
3. STUDIO ITEMSで話題選定がしやすいか
4. 収録後にSTATEMENTS / PUBLICATIONSへ自然に移れるか
5. 別DBを直接開く回数を減らせたか
6. Dashboard管理自体が新しい作業負担になっていないか

評価後にのみ、毎週のWeekly Controlページ生成や対象EPISODE差替えの自動化を検討する。

自動化は目的ではなく、あさくらじゅんが一人で番組を作る負担を下げる場合にのみ採用する。
