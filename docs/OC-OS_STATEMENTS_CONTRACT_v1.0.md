# OC-OS STATEMENTS Contract v1.0

基準日: 2026-09-26

## 1. 目的

STATEMENTSは、おひさまコネクトで実際に発した言葉のうち、後から参照する価値のある発言・価値観・変化・重要な瞬間を保存するOC-OSの主観アーカイブである。

Transcript全文の代替ではない。Transcriptは発言記録、STATEMENTSはその中から人間が「残す価値がある」と判断した発言の索引・履歴である。

## 2. Canonical Rule

- AIはSTATEMENTSの候補を作成できる。
- AIは `Review_Status = 確定` にしてはいけない。
- 新規AI抽出は必ず `Review_Status = 候補` / `Origin = AI抽出` とする。
- `確定` / `見送り` はあさくらじゅんが判断する。
- `Spoken_Text` はTranscriptに根拠を持つ実際の発言抜粋であり、AIによる言い換え・要約を入れない。
- `Statement` は一覧で識別するための短い見出しであり、発言本文そのものではない。
- `AI_Candidate_Reason` はAIが候補化した理由であり、Canonicalな意味付けではない。
- `Human_Memo` / `Context_Memo` は人間側の補足に使う。
- STATEMENTSからEPISODEの使用実績や発言内容を逆推定しない。

## 3. Schema

```text
Statement             TITLE      一覧用の短い見出し
Statement_ID          UNIQUE_ID  STM-
Review_Status         SELECT     候補 / 確定 / 見送り
Statement_Type        SELECT     名言 / 価値観 / 変化 / 瞬間 / その他
Origin                SELECT     AI抽出 / 手動登録
Episode               RELATION   EPISODES
Spoken_Text           TEXT       Transcriptに根拠を持つ実際の発言抜粋
Source_Timecode       TEXT       Transcript上の位置
Source_Transcript_URL URL        抽出時の正式Transcript
Related_Members       RELATION   HHA MEMBERS
Related_Member_Hints  TEXT       AIが挙げたCanonical名候補。Relation解決できなくても保持
Emotion_Tags          MULTI      喜び / 感謝 / 誇り / 驚き / 期待 / 愛着 / 寂しさ / 葛藤 / 熱量 / その他
AI_Candidate_Reason   TEXT       AI候補化理由
Context_Memo          TEXT       人間が残す文脈
Human_Memo            TEXT       人間の判断・補足
Candidate_Key         TEXT       importerが生成する重複防止キー
Extractor_Version     TEXT       候補生成ロジックの版
Created_Time          CREATED_TIME
Last_Edited           LAST_EDITED_TIME
```

## 4. Views

```text
01｜要確認  Review_Status = 候補
10｜確定    Review_Status = 確定
90｜見送り  Review_Status = 見送り
```

`10｜確定` にあるものだけをCanonical STATEMENTSとして扱う。

## 5. Candidate Artifact Contract

AI抽出器はNotionへ直接書き込まず、まずJSON artifactを生成する。

保存先:

```text
EPISODE/
  TRANSCRIPT/
    MACHINE/
      <Episode_Key>_STATEMENT_CANDIDATES.json
```

JSON Schema v1.0:

```json
{
  "schema_version": "1.0",
  "extractor_version": "<provider-or-prompt-version>",
  "episode_key": "2026-10-04",
  "source_transcript_url": "https://docs.google.com/...",
  "candidates": [
    {
      "statement": "短い見出し",
      "spoken_text": "Transcriptからの実際の発言抜粋",
      "source_timecode": "00:12:34-00:12:58",
      "statement_type": "価値観",
      "emotion_tags": ["愛着", "熱量"],
      "related_member_names": ["小坂 菜緒"],
      "ai_candidate_reason": "なぜ後から参照する価値がありそうか"
    }
  ]
}
```

## 6. AI Extraction Rules

AIが候補にしてよいのは、例えば以下。

- 番組や日向坂46への姿勢が明確に現れた発言
- 過去の自分との変化が見える発言
- 将来、同じテーマを話した時に比較する価値がある発言
- 強い感情が言語化された発言
- 番組の方向性・制作観・ファンとしての価値観を示す発言
- その回固有の重要な瞬間として後から参照する価値がある発言

AIがしてはいけないこと:

- 普通の進行文や挨拶を大量に候補化する
- 発言を美文化・要約・言い換えして `Spoken_Text` に入れる
- 本人が言っていない意図を補完する
- 「重要そう」という理由だけで確定扱いする
- Transcriptに存在しない引用を生成する

候補数は網羅性より精度を優先し、1回あたり少数でよい。0件も正常とする。

## 7. Import Rule

GAS importerは次だけを行う。

1. 明示された `OC_TARGET_EPISODE_KEY` のEPISODEを取得
2. `TRANSCRIPT/MACHINE` の `*_STATEMENT_CANDIDATES.json` を1件だけ読む
3. JSONの `episode_key` が対象回と一致することを確認
4. `Candidate_Key` を `Episode_Key + Source_Timecode + Spoken_Text` からSHA-256で生成
5. 既存Candidate_Keyがある場合は再作成しない
6. HHA MEMBERSは `Member_Name` 完全一致だけをRelation化
7. 未一致Member名は `Related_Member_Hints` に残す
8. 新規行は必ず `Review_Status = 候補`, `Origin = AI抽出`
9. `Context_Memo` / `Human_Memo` は自動入力しない
10. 既存STATEMENTを自動更新・削除しない

## 8. Human Review

`01｜要確認` であさくらじゅんが確認する。

確認項目:

- Spoken_Textは実際の発言か
- 前後文脈を切り取りすぎていないか
- 保存する価値が本当にあるか
- Statement_Typeは妥当か
- Emotion_Tagsは妥当か
- Related_Membersは妥当か
- 必要ならContext_Memo / Human_Memoを追記

その後、`Review_Status` を `確定` または `見送り` に変更する。

## 9. Relationship to Transcript

```text
MASTER
↓
Transcript Pipeline
↓
Formal Transcript
↓
STATEMENT candidate extraction
↓
*_STATEMENT_CANDIDATES.json
↓
Candidate Importer
↓
STATEMENTS / 候補
↓
あさくら確認
↓
STATEMENTS / 確定
```

Transcriptは証拠、STATEMENTSは人間が選んだ主観的アーカイブである。

## 10. Principle

STATEMENTSの価値は「AIがうまく要約したこと」ではなく、過去のあさくらじゅんが実際に何を語り、その中から現在のあさくらじゅんが何を残すと判断したかを履歴として蓄積できることにある。
