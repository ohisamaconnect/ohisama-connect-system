# OC-OS INBOX Suggestion Layer v1.0

Date: 2026-09-27
Status: Canonical design / Pilot

## 1. Core principle

OC-OS の INBOX は次の責務分離を守る。

1. **Collection** — GAS / Crawler が漏れなく集める。
2. **Suggestion** — ルール・既存EVENT照合・将来のAIが「提案」する。
3. **Decision** — あさくらじゅんが最終判断する。
4. **Processing** — Decision確定後のみ Inbox Processor が SOURCES / EVENTS へ反映する。

Suggestion Layer は Decision を一切確定しない。

> 集めるのはGAS。提案するのは機械。判断するのはあさくらじゅん。

## 2. INBOX properties

Suggestion専用として以下を使用する。

- `Suggested_Decision`
  - 未提案
  - SOURCESのみ登録候補
  - 既存EVENTへ追加候補
  - 新規EVENT作成候補
  - 対象外候補
- `Suggested_Event`
  - Current OC-OS EVENTS への候補Relation
- `Suggestion_Reason`
  - なぜその提案になったかを短く記録
- `Suggestion_Confidence`
  - 高 / 中 / 低

Human-owned property:

- `Decision`
- `Event`

Suggestion Engine は `Decision` と `Event` を変更してはならない。

## 3. v0.1 rule layer

v0.1 は AI を必須にしない。まずルールと既存EVENT照合で提案する。

### EVENTになりやすい表現

例:

- 発売決定
- 開催決定
- 出演決定 / 出演
- 放送決定
- 生配信決定
- MUSIC VIDEO / MV 公開
- 先行配信開始
- 卒業のお知らせ
- 活動休止 / 活動再開
- 加入 / 誕生 / オーディション開始
- 中止 / 延期

### 既存EVENTの追加SOURCEになりやすい表現

例:

- 先行受付
- 特典
- グッズ
- 注意事項
- チケット / トレード
- 追加販売
- コラボ
- パネル展示
- ジャケット / バックカバー
- 収録内容
- フォーメーション
- 歌唱メンバー
- 払い戻し

### SOURCEのみになりやすい表現

例:

- 雑誌掲載 / 表紙 / 巻頭 / 中面
- ブログ更新告知
- 通常の動画公開
- 通常の記事・インタビュー

ただし、文字列ルールは最終判断ではない。

## 4. Existing EVENT matching

Suggestion Engine は Current OC-OS EVENTS を検索し、タイトルの主要語・作品名・企画名の一致を使って候補EVENTを提示できる。

例:

- `18thシングル『イチャイチャ虫』CDショップ...` 
  → `18thシングル『イチャイチャ虫』発売` が存在すれば Suggested_Event に提示。

既存EVENTらしいが Current EVENTS に見つからない場合は、

- `Suggested_Decision = 既存EVENTへ追加候補`
- `Suggested_Event = 空欄`
- `Suggestion_Reason = 親EVENT欠落の可能性`

として、人間に欠落Backfillを知らせる。

## 5. AI layer

AIは v0.2 以降の補助レイヤーとする。

主な用途:

- ルールだけでは曖昧なINBOX
- 既存EVENT候補が複数あるケース
- 親EVENT名の推定
- Googleニュース記事が既存EVENTの二次SOURCEかどうかの提案

AIも `Decision` を確定しない。

## 6. Backfill Pilot

初期検証対象:

- 2026-08-01 ～ 2026-09-19
- 日向坂46公式 NEWS を中心とする
- 同一公式URLは重複として扱う
- 過去を完全網羅するためではなく、Current OC-OS EVENTS の「親EVENTの土台」を作るためのBackfill

重点候補:

- 18thシングル『イチャイチャ虫』
- 18th Single ひなた坂46 LIVE
- ひなたフェス2026
- 三期生LIVE
- ARENA TOUR「ひなくり2026」
- 金村美玖2nd写真集
- 森本茉莉 卒業 / 卒業セレモニー
- 青葉坂46関連

## 7. Safety / Human authority

- Suggestion は誤っていてよい。Decision は人間が確定する。
- Suggestion Engine は SOURCES / EVENTS を作らない。
- Suggestion Engine は `Decision` / `Event` / `Status` を変更しない。
- Inbox Processor は従来どおり `Decision != 未判断` のときだけ処理する。
- 「既存EVENTへ追加候補」なのに Suggested_Event が空なら、親EVENT欠落の可能性として扱う。
- Wednesday recording continuity の条件にはしない。

## 8. Deployment rule

Pilot 中は自動トリガーを入れない。

1. Preview
2. 人間が結果を確認
3. Manual Write
4. Backfill実データで監査
5. 精度を見てルール調整
6. 必要ならAI補助を追加
7. 安定後に定期実行を検討
