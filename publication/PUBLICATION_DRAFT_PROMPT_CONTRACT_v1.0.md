# OC-OS Publication Draft Prompt Contract v1.0

基準日: 2026-09-26

## Purpose

正式TranscriptとEPISODE Actualsを材料に、外部公開用の「AI下書き候補」を生成する。

この工程は公開判断ではない。AIは素材を作るだけで、最終文面・公開可否・公開タイミングはあさくらじゅんが決める。

## Input Priority

1. 正式Transcript
2. EPISODE Actuals
   - Events
   - Songs
   - Sources
   - Structure_Memo
   - Setlist_Memo
3. 人間が確定したSTATEMENTS
4. HHA Canonical data
   - 固有名詞表記
   - 客観的な基本事項の補助確認

HHAは「実際に放送で何を言ったか」の根拠にはしない。

## Absolute Generation Rules

- Transcriptに存在しない一人称感情を追加しない。
- 発言を美文化・強調・一般化して別の意味にしない。
- 放送で言っていない主張を「あさくらじゅんの考え」として追加しない。
- 不確実な事実を補完しない。
- HHAの正しい事実で、実際の放送発言を自動訂正しない。
- 曲名・メンバー名等の表記はHHA Canonical表記を参照してよい。
- 事実確認が必要な箇所は `review_notes` に明示する。
- 生成結果は必ずDraftであり、公開済・確定扱いにしない。
- 不要な公開物は0件でもよい。

## Supported Draft Types

### note / ショーノート

目的は「放送内容を読める形へ整理すること」。

- 放送内容の順序を尊重する。
- 必要に応じて見出しを付けられる。
- 一人称の新規感情を創作しない。
- 放送の完全逐語録にはしない。
- 長文全文は `draft_text` に入れ、ImporterがGoogle Docs化できる。

### SNS投稿

- 放送内容・公開成果物の紹介文候補。
- 短くしてよいが、意味を変えない。
- 煽り文句を勝手に追加しない。
- ハッシュタグは候補として扱う。

### トーク音声説明文

- TALK_CANDIDATE / 公開用音声の説明文・タイトル候補。
- 音声そのものの公開可否はAIが判断しない。

### オーディオグラム

- 実際のTranscriptから短い発言候補を選ぶ。
- 発言の書き換えは禁止。
- 字幕用に句読点・改行を整理しても意味は変えない。

## Output JSON

```json
{
  "schema_version": "1.0",
  "episode_key": "2026-10-04",
  "source_transcript_url": "https://docs.google.com/...",
  "generator_version": "publication-draft-v1.0",
  "generated_at": "2026-10-01T12:34:56+09:00",
  "drafts": [
    {
      "publication_key": "2026-10-04|ショーノート|note",
      "draft_key": "2026-10-04|ショーノート|note|publication-draft-v1.0|001",
      "publication": "2026-10-04｜note下書き",
      "output_type": "ショーノート",
      "platform": "note",
      "title_candidates": ["候補1", "候補2"],
      "draft_text": "AI下書き本文",
      "review_notes": "確認事項。なければ空文字"
    }
  ]
}
```

## Identity

`publication_key` は公開物の安定ID。

```text
Episode_Key|Output_Type|Platform
```

同じ公開物を再生成しても変えない。

`draft_key` は生成版のID。Generatorや入力Transcriptが変われば変更してよい。

## Model Independence

このContractはGemini / ChatGPT / その他の生成モデルから独立している。

モデル固有API・モデル名・temperature等は実装層の設定であり、PUBLICATIONSのCanonical Schemaには持ち込まない。
