# OC-OS PUBLICATIONS Contract v1.0

基準日: 2026-09-26

> **CURRENT / Canonical運用候補**
>
> PUBLICATIONSの現行自動作成入口は `gas/oc_os_publication_draft_importer_v0.1.0.gs` とする。
> `gas/oc_os_publication_plan_seeder_v0.1.0.gs` は初期設計履歴として **Legacy / Do Not Run** とする。
> 現行Pilotでは両者を併用しない。

## 1. 目的

PUBLICATIONSは、1つのEPISODEから派生する外部公開物を1成果物1レコードで管理するDBである。

対象例:

- Spotify等のトーク音声
- note等のショーノート / エッセイ
- X / Instagram等のSNS投稿
- オーディオグラム
- その他の公開成果物

EPISODES.Public_URLは代表URLまたは旧互換のショートカットとして残し、複数公開物のCanonical管理はPUBLICATIONSで行う。

## 2. Principle

- 電波放送そのものが番組の最終成果である。
- PUBLICATIONSは放送の再定義ではなく、放送後・放送周辺の外部発信管理である。
- AIは下書きを作れるが、公開可否・最終文面・公開タイミングはあさくらじゅんが決める。
- AI/GASは `Publication_Status = 公開準備済` または `公開済` を勝手に設定しない。
- 実際に公開されるまで `Public_URL` を作ったことにしない。
- 外部公開物が存在しない回も正常とする。
- AI再生成によってPUBLICATIONSレコードを増殖させない。
- 既存の人間編集・Final_Text・公開済情報をAI再生成で上書きしない。
- 各回について「トーク音声・note・SNS・オーディオグラム」を必ず作るとは仮定しない。

## 3. Schema

```text
Publication             TITLE
Publication_ID          UNIQUE_ID (PUB-)
Episode                 RELATION -> EPISODES
Publication_Key         公開物自体の安定ID。Episode + Output_Type + Platform等から構成
Draft_Key               現在のAI下書き生成物を識別するキー
Output_Type             トーク音声 / ショーノート / SNS投稿 / オーディオグラム / その他
Platform                未定 / Spotify / note / X / Instagram / YouTube / その他
Publication_Status      未着手 / 下書き / 確認待ち / 公開準備済 / 公開済 / 見送り
Origin                  手動 / AI下書き
AI_Title_Candidates     AIが提案したタイトル候補。確定タイトルではない
AI_Draft_Text           AIが作成した短文案。人間承認前の素材
AI_Review_Notes         事実確認・要確認・Transcript外推論回避等の補助メモ
Final_Text              人間が採用・修正した最終短文。AIが自動確定しない
Draft_URL               下書きのGoogle Docs/Drive等
Public_URL              実際に公開されたURL
Scheduled_At            公開予定日時
Published_At            実公開日時
Source_Transcript_URL   下書き生成時の正式Transcript
Generator_Version       AI生成Prompt/Generatorの版
Draft_Generated_At      AI下書き生成日時
Human_Memo              人間の補足
Created_Time
Last_Edited
```

## 4. Identity Rule

### Publication_Key

1つの「公開物」を識別する恒久キー。現行形式:

```text
<Episode_Key>|<Output_Type>|<Platform>
```

例:

```text
2026-10-04|ショーノート|note
2026-10-04|SNS投稿|X
2026-10-04|トーク音声|Spotify
```

同一Publication_KeyのPUBLICATIONSレコードは原則1件とする。

旧Plan Seederが使用していた

```text
PUBPLAN|<Episode_Key>|TALK_AUDIO
PUBPLAN|<Episode_Key>|SHOW_NOTES
...
```

形式は**Legacy Key**であり、現行Importerでは使用しない。

### Draft_Key

同じ公開物について、どの入力とGeneratorで生成したAI下書きかを識別する版キー。

```text
Publication_Key + Source Transcript + Generator Version + draft artifact identity
```

AI再生成時にDraft_Keyが変わっても、新しいPUBLICATIONSレコードを自動作成しない。既存Publication_Keyがある場合はPreviewで差分候補として扱い、人間確認なしに既存AI_Draft_Textを置換しない。

## 5. Views

```text
00｜進行管理     Publication_StatusでBoard管理
05｜下書き確認   AI下書きの人間レビュー
10｜公開準備済   人間が公開可能と判断したもの
20｜公開済       実際に公開されたもの
```

## 6. Status Rule

### 未着手

公開物を作る予定だけ存在する状態。手動で必要な場合に使用できるが、全EPISODEへ定型枠を自動Seederする現行運用は採用しない。

### 下書き

人間またはAIによる下書きが存在する。まだ承認ではない。

### 確認待ち

素材としては完成しているが、あさくらじゅんの最終確認が必要。

### 公開準備済

あさくらじゅんが内容と公開可否を確認した状態。

### 公開済

実際の公開を確認し、Public_URL / Published_Atを記録した状態。

### 見送り

その成果物を今回は公開しないと人間が判断した状態。

## 7. AI Draft Rule

AIは以下を作成可能:

- note下書き
- SNS投稿文候補
- オーディオグラム用字幕・短文候補
- トーク音声の説明文・タイトル候補

AIがしてはいけないこと:

- 放送で言っていない内容を本人の発言として追加する
- 発言の意味を都合よく美文化する
- AI案を `Final_Text` に直接確定する
- `公開準備済` / `公開済` を自動確定する
- 外部サービスへ自動公開する
- 人間の最終判断なしにPublication_Statusを承認段階へ進める
- HHAの事実を使って、実際に放送で言った内容を「訂正」する
- Transcript外の感情を本人の感情として補う

AI生成時は `Origin = AI下書き`、`AI_Draft_Text` または `Draft_URL`、`Generator_Version`、`Draft_Generated_At`、`Source_Transcript_URL`、`Publication_Key`、`Draft_Key` を残す。

短文の場合:

```text
AI → AI_Draft_Text
人間確認・修正 → Final_Text
```

長文の場合:

```text
AI → Google Docs等のDraft
    → Draft_URL
人間確認・修正 → 同Draft上で確定
```

## 8. Grounding Rule

AI下書きの主な根拠は以下の順で扱う。

1. 正式Transcript
2. EPISODEのActuals（Events / Songs / Sources / Structure_Memo / Setlist_Memo）
3. 人間が確定したSTATEMENTS

HHAは表記・固有名詞・客観事項の確認補助には使えるが、「放送で何を言ったか」の根拠にはしない。

Transcriptにない新しい一人称感情・感想・評価をAIが追加してはいけない。

## 9. Talk Audio Rule

著作権上、放送MASTER（楽曲込み）をそのまま公開用トーク音声として使用しない。

トーク音声公開物は、公開用に別途作成した「楽曲を含まない成果物」を参照する。

`AUDIO/SPEECH_STEM` は文字起こし処理用中間成果物であり、そのまま公開用音源とみなさない。

公開用音声の編集・品質確認は別工程とする。

## 10. Long-form Text Rule

note等の長文成果物はGoogle Docs等をDraft正本にできる。

PUBLICATIONSには `Draft_URL` を保持し、公開後に `Public_URL` を追加する。

`AI_Draft_Text` / `Final_Text` に長文全文を重複保存することは必須ではない。

## 11. SNS Rule

SNS投稿は短文なら、AI案を `AI_Draft_Text`、人間が採用・修正した本文を `Final_Text` に保持する。

画像・動画・オーディオグラムの実体はGoogle Drive等に置き、必要に応じて `Draft_URL` から参照する。

Platformは作成時点で決めなくてもよく、`未定` を許可する。

## 12. Import Safety

Publication Draft Importerは次を守る。

- WRITEには `OC_TARGET_EPISODE_KEY` を必須とする。
- JSONのepisode_keyが対象EPISODEと一致しなければBLOCKする。
- 新規Publication_Keyだけを自動作成対象とする。
- 既存Publication_Keyは自動更新しない。
- `Final_Text` / `Public_URL` / `Published_At` を自動設定しない。
- AI生成レコードは `Publication_Status = 下書き`、`Origin = AI下書き` で作る。
- AIが指定した `公開準備済` / `公開済` 等のStatusは受け付けない。

現行Handler:

```text
previewPublicationDraftImportV01()
importPublicationDraftsV01()
```

Legacy / 使用禁止:

```text
previewPublicationPlanV01()   # 履歴確認用Previewのみ
seedPublicationPlanV01()      # WRITE disabled
```

## 13. Relationship to EPISODE

```text
EPISODE
  ├─ Statements
  └─ Publications
       ├─ Spotify Talk Audio
       ├─ note Show Notes
       ├─ SNS Post
       └─ Audiogram
```

EPISODES.Public_URLは代表リンクを必要とする場合のみ利用する。

複数PUBLICATIONSの存在からEPISODEのProduction_Statusを自動変更しない。

## 14. Weekly Position

```text
水曜 収録
↓
木〜金 Post-Recording / Transcript / Statements
↓
土〜日 Publications下書き・確認
↓
日曜 放送
↓
必要な公開
↓
Public_URL / Published_At記録
```

PUBLICATIONSが制作を支配してはいけない。水曜収録に間に合わせることを最優先とし、公開工程は放送本体から分離する。

## 15. Legacy Plan Seeder

`oc_os_publication_plan_seeder_v0.1.0.gs` は、各EPISODEに対してトーク音声・ショーノート・SNS・オーディオグラムの作業枠を先に作る初期案だった。

現行では採用しない理由:

1. 公開物が0件の回も正常であり、不要な枠を毎週作る必要がない。
2. 旧Seederの `PUBPLAN|...` Keyと現行Draft Importerの `Episode_Key|Output_Type|Platform` Keyが一致しない。
3. 両方を併用すると同じ意図の公開物が二重レコードになる可能性がある。
4. 「実際に作るものだけPUBLICATIONSへ入る」方が、ひとり制作の運用負荷が小さい。

したがって、旧Seederは履歴として残すがWRITEは停止し、現行PilotではDraft Importerのみを使用する。
