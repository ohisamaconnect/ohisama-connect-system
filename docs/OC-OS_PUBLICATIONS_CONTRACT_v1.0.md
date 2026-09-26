# OC-OS PUBLICATIONS Contract v1.0

基準日: 2026-09-26

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

## 3. Schema

```text
Publication          TITLE
Publication_ID       UNIQUE_ID (PUB-)
Episode              RELATION -> EPISODES
Output_Type          トーク音声 / ショーノート / SNS投稿 / オーディオグラム / その他
Platform             未定 / Spotify / note / X / Instagram / YouTube / その他
Publication_Status   未着手 / 下書き / 確認待ち / 公開準備済 / 公開済 / 見送り
Origin               手動 / AI下書き
Draft_URL             下書きのGoogle Docs/Drive等
Public_URL            実際に公開されたURL
Final_Text            短文成果物の最終本文。長文はDraft_URL側を正本にしてよい
Scheduled_At          公開予定日時
Published_At          実公開日時
Source_Transcript_URL 下書き生成時の正式Transcript
Generator_Version     AI生成Prompt/Generatorの版
Draft_Generated_At    AI下書き生成日時
Human_Memo            人間の補足
Created_Time
Last_Edited
```

## 4. Views

```text
00｜進行管理     Publication_StatusでBoard管理
10｜公開準備済   人間が公開可能と判断したもの
20｜公開済       実際に公開されたもの
```

## 5. Status Rule

### 未着手

公開物を作る予定だけ存在する状態。

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

## 6. AI Draft Rule

AIは以下を作成可能:

- note下書き
- SNS投稿文候補
- オーディオグラム用字幕・短文候補
- トーク音声の説明文・タイトル候補

AIがしてはいけないこと:

- 放送で言っていない内容を本人の発言として追加する
- 発言の意味を都合よく美文化する
- `公開準備済` / `公開済` を自動確定する
- 外部サービスへ自動公開する
- 人間の最終判断なしにPublication_Statusを承認段階へ進める

AI生成時は `Origin = AI下書き`、`Generator_Version`、`Draft_Generated_At`、`Source_Transcript_URL` を残す。

## 7. Talk Audio Rule

著作権上、放送MASTER（楽曲込み）をそのまま公開用トーク音声として使用しない。

トーク音声公開物は、公開用に別途作成した「楽曲を含まない成果物」を参照する。

`AUDIO/SPEECH_STEM` は文字起こし処理用中間成果物であり、そのまま公開用音源とみなさない。

公開用音声の編集・品質確認は別工程とする。

## 8. Long-form Text Rule

note等の長文成果物はGoogle Docs等をDraft正本にできる。

PUBLICATIONSには `Draft_URL` を保持し、公開後に `Public_URL` を追加する。

`Final_Text` は長文全文の重複保存を必須としない。

## 9. SNS Rule

SNS投稿は短文なら `Final_Text` を正本として保持できる。

画像・動画・オーディオグラムの実体はGoogle Drive等に置き、必要に応じて `Draft_URL` から参照する。

Platformは作成時点で決めなくてもよく、`未定` を許可する。

## 10. Relationship to EPISODE

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

## 11. Weekly Position

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
