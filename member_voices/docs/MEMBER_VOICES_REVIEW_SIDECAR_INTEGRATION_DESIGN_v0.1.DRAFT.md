# MEMBER VOICES — REVIEW保存方式と参照不一致解決の次工程設計 v0.1 DRAFT

Status: **NON-PRODUCTION DESIGN ONLY / Owner採用判断待ち**
Date: 2026-10-11 JST
Source approval: MV-CAL10-RECON-APPROVAL-20261010-01（一般契約DRAFT・非Production試験のみ承認）。
Context: VOICE-20261010-36 / Run CAL10-P1-20261010-084821 FAIL
**Do not treat the latest user confirmation of the DRAFT as permission to edit existing Gold, preview, live schema/prompt/adapter, Notion/SQLite, or to re-run any Calibration.**

## 今回得られたSource-First所見
保存元Google Driveの `article.txt` を直接取得して以下を照合した。
- 25481: 過去の本人の応募動機と、現在のオーディションCMを見た応募者への思いが別々に本文に存在。
- 35133: センターの重圧、外れた際の複雑な感情、第2章・再挑戦が別々に本文に存在。
- 65922: 「ラブレター」としてのブログ、「桜梅桃李」、ブログを夢への一歩にする考え、ダンスの表現力目標がいずれも本人の文として本文に存在。Goldが3命題、Previewが2命題であることは、どちらか片方だけが必ず正しいことを意味しない。
- **取得本文のスコープ注意:** 65922の保存本文末尾には記事の後にサイト回遊／隣接記事らしい文字列が混在する。今後のSemantic検証では記事本文内の発言かナビゲーション文かを区別する設計が必要。ARTICLE_TEXT全体が発話者自身の文章とは限らない。

3件の仮提案は[CAL10_REFERENCE_ADJUDICATION_PACKET_2026-10-11.DRAFT.json](../eval/CAL10_REFERENCE_ADJUDICATION_PACKET_2026-10-11.DRAFT.json)に根拠・Gold／Preview crosswalk・代替案・Owner判断欄を保存。**Goldを変更しない**。

## 契約統合方式の比較

| 判定軸 | A: Provider Schema + Adapterに三値統合 | B: 既存Adapterを維持し、非Productionの独立REVIEW Sidecar |
|---|---|---|
| REVIEW-onlyの保存 | Schema・Adapterの対応改修が必須 | Sidecarが保存できる。既存Adapterに渡さない |
| v0.1の互換性 | `voice_eligible`との整合とv1.1変換が難所 | Accepted本流の現契約と分離できる |
| 既存Production安全性 | 変更時に回帰・移行設計が必要 | 現行本流は一切触れない |
| 判断保留の可視性 | 本流入力とレビュー待ちが混在し得る | 単独管理し、レビュー対象を明示しやすい |
| 評価・監査 | 一つのProvider出力に集約可能 | 2系統の対応表と同一Sourceの紐付けが必要 |
| 後日移行 | SchemaバージョンとAdapter移行が必要 | 再審査後に採用時だけ明示的変換できる |

**暫定推奨: B（REVIEW Sidecar）を先に非Production Pilot設計する。** 現行アダプターにREVIEW-only候補を直接渡さず、データ保全・説明可能性を優先する。これは**正式な統合方式の決定ではない**。v0.2.2 DRAFT SchemaはA方式の評価資産として維持し、捨てない。

## B方式の仮データ契約

1. `schema_id: MV_REVIEW_SIDECAR_v0.1_DRAFT` を採用。ファイルは検証用データでありNotion DBや永続Voiceとは別。
2. `source_ref_key`、記事ID、confirmed_speaker、SourceのDrive参照・SHA、対象となる記事本文範囲（証拠）を保持。Source Titleは証拠ではない。
3. `local_review_ref` は一時的な局所参照 `R1`, `R2` …。**VOC永久ID、HHA IDを採番しない**。
4. `disposition=REVIEW`、`voice_eligible=false`、`owner_resolution=PENDING` を初期状態とする。Accepted本流候補への自動投入は禁止。
5. 提案命題、正確なEvidence、境界上の懸念（`DURABILITY`, `GRANULARITY`, `ATTRIBUTION`, `SOURCE_SCOPE`, `REFERENCE_CONFLICT`, `RELATION_ALLOWLIST` 等）、本流との関係・元Run情報を記録。
6. Relationを含める場合、評価対象の `RELATION_CONTEXT` に登録されているCanonical IDだけを型別に使用。未解決の固有名は表示ラベルとして分離。空allow-listなら関係IDは空。
7. `owner_resolution` の変更は別途Ownerの明示判断後。SidecarでAccept判断があっても、既存Accepted/Gold/Notion/SQLiteへ勝手に反映しない。正式反映には別のPromotion Gateを要する。
8. Source Scope: blogの本文末尾からナビゲーションへ出てしまった場合はレビュー理由 `SOURCE_SCOPE` を付けて保留にし、当該項目を発話者のVoiceと断定しない。
9. Golden Setへの変更禁止。Gold vs Preview衝突は `REFERENCE_CONFLICT` として双方の参照と独立したOwner判断欄を残す。

### パイプライン想定（非Production）
`Source Resolver PASS` → `Evidence-only MU inventory` → `Candidate proposal ACCEPT / REVIEW / REJECT` → `Policy preflight` → `REVIEW Sidecar (DRAFT)` と `accepted candidate preview (no permanent write)` の2方向。
**現時点でこの配線は構築・起動していない。概念設計のみ。**

## 必要な非Production契約テスト
- 0件REVIEW、REVIEW-only、重複local ref、欠落Evidence、本文外Evidence、異なるSourceへの跨り、allow-list違反
- Context-only MUをAccepted summaryに昇格しない
- Referenced Gold/Preview競合の保存と、Owner未承認状態でのオラクル採用禁止
- 保存済みArticle内のフッター／回遊テキストの混入検出（完全な自動検出は未定）
- Sidecar情報だけからVOC ID、Notion Page、SQLite永続レコードを作れない

## 未承認工程
- 正式な参照基準の裁定（25481／35133／65922）
- A/B方式の正式採用、Provider／Adapter接続、回帰対象を実記事へ拡張する工程
- Gold・Preview・現行Prompt・現行Schema・正式VOICEの書換え
- 新規Calibration Pass1／Pass2／Pass3、Production一括処理

## 完了条件
このDRAFT、3記事crosswalk、テスト・readback記録を保存しProject Controlへ参照登録する。
次に本人が判断すべき対象は **3記事の候補分割／選定** と **B推奨を採用するか**。過去の「OK」は完了したブロックを承認して次の**許可済み**工程へ進む合図だが、以前の明示的禁止事項を自動解除しない。
