# OC-OS Weekly Standard Operation v1.0

基準日: 2026-10-04

実地基準: 2026-10-04放送回（Episode_Key `2026-10-04` / 第118回）End-to-End Pilot

## 1. 目的

第118回Pilotで実際に通過した制作工程を、OC-OSの毎週運用へ昇格する。

標準運用の目的は「工程を増やすこと」ではなく、次を同時に満たすことである。

- 水曜収録を止めない
- 実際に起きたことだけをCanonical記録へ戻す
- Write先EPISODEの誤爆を防ぐ
- 機械証拠を残す
- AIが発言・採用・意味付けを決めない
- 毎週の手入力と記憶依存を減らす
- 一人制作で現在地を見失わない

OC-OSはあさくらじゅんをシステムへ適応させない。

**システムが実際の制作へ適応する。**

---

## 2. 第118回Pilotで実証できたこと

第118回では以下を実際の放送回でEnd-to-End実行した。

```text
次回EPISODE準備
↓
STUDIO ITEMS候補準備
↓
水曜スタジオ収録
↓
STUDIO ITEMSを 使用済 / 保留 / 見送り に確定
↓
MASTER保管
↓
TRANSCRIPTION_PROXY
↓
UVR → SPEECH_STEM
↓
Primary ASR / Coverage Audit
↓
HHA + OC Grounded Cleanup
↓
TRANSCRIPT/MACHINEへ機械成果物保存
↓
Formal Transcript Materializer Preview
↓
正式Google Doc生成
↓
人間確認
↓
Post-Recording Integration Preview
↓
Actual Relations + Audio_URL + Transcript_URL sync
↓
実使用Songs確定
↓
Setlist_Memo / Structure_Memo確定
```

Pilot結果として、以下の安全境界が機能した。

- `Studio_Status = 使用済` だけをActual Relationへ反映
- MASTER候補を一意に検査
- 正式Transcript候補を一意に検査
- 既存Relationを削除しない
- 既存URLを自動上書きしない
- `Production_Status` を自動変更しない
- `Structure_Memo` / `Setlist_Memo` をAIが自動確定しない
- Transcriptから「実際に使った曲・話題」を推測しない
- Grounded Cleanupは明示Alias / 確認済Boundary Ruleのみ
- Fuzzy自動補正を行わない

これをOC-OS標準運用の基準とする。

---

## 3. Pilotで分かった改善点

### 3.1 `OC_TARGET_EPISODE_KEY` の毎週手入力を廃止する

PilotではWrite安全性のため、Script Property

```text
OC_TARGET_EPISODE_KEY
```

を手動設定した。

この安全思想自体は正しいが、毎週Apps ScriptのProject Settingsを開いて日付を入力する運用は標準化しない。

今後は

```text
gas/oc_os_target_episode_lock_manager_v0.1.0.gs
```

を使う。

`OC_TARGET_EPISODE_KEY` は「週次設定値」ではなく、**Write対象を一時的に固定するSafety Lock** と定義する。

通常運用で人間がScript Propertiesへ直接入力しない。

### 3.2 収録前対象と収録後対象は同時に別EPISODEになり得る

木曜以降は正常に次の2つが併存する。

```text
PRE_RECORDING
  次週放送回
  準備中 / 収録準備済

POST_RECORDING
  今週収録済回
  収録済 / 放送済 / アーカイブ処理済
```

したがって「現在のEPISODE」を1件だけ自動決定する設計にはしない。

フェーズごとにPreviewし、人間がLock関数を実行する。

### 3.3 Formal Transcriptは派生物であり、修正元ではない

第118回では正式Google Docを生成後、実物確認により追加のCanonical ASR誤認識が見つかった。

正しい処理は以下だった。

```text
Google Docを直接修正しない
↓
Alias辞書へ戻る
↓
validatorを通す
↓
Grounded Cleanup再実行
↓
CLEAN_HHA再確認
↓
旧正式Docの扱いを人間が決定
↓
再Materialize
```

この再生成ルールを標準とする。

### 3.4 Aliasは「正しそうな文への書き換え」ではない

Pilot中、Alias targetがCanonical辞書に存在しない補正をvalidatorが停止した。

これは正常な安全動作である。

標準ルール:

- 固有名詞・運用語などCanonical targetへ明示補正する
- Alias targetはCanonical / fixed termでなければならない
- 文脈依存の一般文補正はAliasへ入れない
- 意味補完をしない
- 不確実なASR文は不確実なまま残す

例:

```text
日立坂46 → 日向坂46        OK
森本マリー → 森本茉莉      OK

CTが4枚 → CDが4枚           文脈依存。自動Aliasにしない
```

### 3.5 Coverage Auditは意味のある欠落を対象にする

Coverage gapが検出されても、実聴確認で単なるフィラー・探索音等と確認できる場合、Transcriptへ人工的に挿入しない。

機械検出 → 人間確認 → 意味欠落の有無を判断、を維持する。

### 3.6 実使用曲はTranscriptだけから確定しない

Pilotでは曲間がMUSICCUTされ、2曲目の曲名がTranscript証拠だけでは確定できなかった。

そのためSongs Relation / Setlistは、実際の収録内容を人間が確認して確定した。

今後も

```text
Transcriptに曲名が見える
= 実使用確定
```

とはしない。

---

## 4. Target Episode Safety Lock v1.0

### 4.1 管理対象

既存モジュールとの互換性のため、Write対象キーは引き続き

```text
OC_TARGET_EPISODE_KEY
```

を使う。

Lock Managerは補助情報として次も管理する。

```text
OC_TARGET_EPISODE_LOCK_MODE
OC_TARGET_EPISODE_LOCKED_AT
```

これらは小さな状態値だけを保持する。

大きな実行状態JSONの保存場所としてScript Propertiesを使わない。

### 4.2 収録前Lock

Preview:

```javascript
previewPreRecordingTargetLockV01()
```

Lock:

```javascript
lockPreRecordingTargetV01()
```

判定規則:

```text
Production_Status = 準備中 / 収録準備済
```

がちょうど1件ならLock可能。

複数ある場合は自動選択せず停止する。

### 4.3 収録後Lock

Preview:

```javascript
previewPostRecordingTargetLockV01()
```

Lock:

```javascript
lockPostRecordingTargetV01()
```

判定規則:

```text
Recording_Date <= today
AND
Production_Status = 収録済 / 放送済 / アーカイブ処理済
```

のうち、Recording_Dateが最も新しいEPISODEを提案する。

最新Recording_Dateが複数件ならLockしない。

### 4.4 現在Lock確認

```javascript
previewCurrentTargetEpisodeLockV01()
```

### 4.5 Lock解除

```javascript
clearTargetEpisodeLockV01()
```

解除するのはTarget Lock Managerが管理する3プロパティのみ。

Notion tokenその他のScript Propertiesには触れない。

### 4.6 原則

Target LockはProduction_Statusではない。

Target Lockは

**「今、このWrite処理をどのEPISODEへ向けるか」**

だけを示す一時的な安全装置である。

---

## 5. 毎週の標準運用

### Phase A — 次回EPISODEの器

目的:

- 次回放送回のEPISODEとDrive skeletonを準備する

使用:

```javascript
previewWeeklyEpisodeBootstrapV01()
createNextWeeklyEpisodeV01()
```

Bootstrapは内容・曲・メールを決めない。

Episode_Noも自動推測しない。

### Phase B — 月〜火: 収録材料を揃える

対象:

```text
PRE_RECORDING
```

必要時に:

```javascript
previewPreRecordingTargetLockV01()
lockPreRecordingTargetV01()
```

主作業:

- INBOX収集
- 出典確認
- STUDIO ITEMS候補化
- MESSAGE候補確認
- SONG候補確認
- Candidate Reason等の補助情報

人間判断として残す:

- 放送採用
- 感情の言語化
- 曲の意味付け
- 話す / 話さない
- 最終構成

### Phase C — 水曜: スタジオ

収録開始条件は「システムが完全」であることではない。

Notion / GAS / AI / ネットワークに障害があっても収録する。

スタジオでは候補を見ながら人間が判断する。

収録後に:

```text
STUDIO ITEMS
候補 → 使用済 / 保留 / 見送り
```

を確定する。

収録完了後、Production_Statusを `収録済` へ進める判断はあさくらじゅんが行う。

### Phase D — 木〜金: Post-Recording

まず対象を切り替える。

```javascript
previewPostRecordingTargetLockV01()
lockPostRecordingTargetV01()
```

標準順序:

```text
MASTER → AUDIO/MASTER
↓
TRANSCRIPTION_PROXY
↓
UVR
↓
SPEECH_STEM
↓
transcribe_episode_v0.4.1.py
↓
Coverage Audit
↓
hha_clean_transcript.py
↓
CLEAN_HHA / Correction Evidence
↓
previewTranscriptMaterializerV01()
↓
materializeFormalTranscriptDocV01()
↓
正式Google Doc 人間確認
↓
previewPostRecordingIntegrationV01()
↓
Human Gate
↓
syncPostRecordingIntegrationV01()
```

Integrationが自動で確定しないもの:

```text
Production_Status
Structure_Memo
Setlist_Memo
MESSAGE使用判断
発言内容
既存Relation削除
既存URL上書き
```

### Phase E — Actual Setlist / Structure

Post-Recording Integration後、実際の収録を基に確認する。

EPISODEへ残す:

```text
Songs Relation = 実際に使用したHHA SONGS
Setlist_Memo    = 実際の曲順 / FULL / BGM等
Structure_Memo  = 実際の番組進行
```

Transcriptだけで不明な曲は人間へ確認する。

AIは推測して埋めない。

### Phase F — 土〜日: 公開準備とFM放送

内部アーカイブと外部公開を混同しない。

note / SNS / Spotify等を作らない週があっても正常。

本放送完了後、あさくらじゅんの判断で

```text
収録済 → 放送済
```

へ進める。

再放送が残っていても本放送完了を基準にしてよい。

### Phase G — Archive / Completion

Archive Gate確認:

```javascript
previewEpisodeCompletionGateV01()
```

Archive必須:

```text
Audio_URL
Transcript_URL
STUDIO ITEMSに候補が残っていない
Actual Relations不足なし
Structure_Memo
Setlist_Memo
```

満たしたことを人間が確認後、

```text
放送済 → アーカイブ処理済
```

へ進める。

その後、STATEMENTS候補やPUBLICATIONS未処理が解消したら、人間判断で

```text
アーカイブ処理済 → 完了
```

へ進める。

---

## 6. Human Gates

標準運用では、Human Gateを削除して自動化率を上げることを目的にしない。

残すHuman Gate:

1. 出典確認
2. STUDIO ITEMSの使用済 / 保留 / 見送り
3. Coverage gapの意味確認
4. Grounded Cleanup補正内容確認
5. Formal Transcript確認
6. Post-Recording Integration Preview確認
7. 実使用Songs / Setlist / Structure確認
8. Production_Status変更
9. STATEMENTS採用
10. PUBLICATIONS公開判断

これらはシステムの未完成部分ではなく、**意図的に人間へ残した権限**である。

---

## 7. Transcript標準ルール

Canonical artifact構造:

```text
EPISODE/
  AUDIO/
    MASTER/
    TRANSCRIPTION_PROXY/
    SPEECH_STEM/
  TRANSCRIPT/
    <正式Google Doc 1件>
    MACHINE/
      *_TRANSCRIPT.json
      *_AUDIT.txt
      *_CLEAN_HHA.txt
      *_HHA_CORRECTION_REPORT.txt
      *_HHA_CORRECTIONS.json
      optional SRT / VTT
```

### Primary ASR

- Coverage First
- HHA glossaryをPrimary ASRへ注入しない
- JSON machine evidenceを書き換えない

### Cleanup

- HHA / OC explicit aliasのみ
- Fuzzy rewriteなし
- Semantic paraphraseなし
- Canonical targetでないAliasはvalidatorが拒否

### Formal Doc

- `CLEAN_HHA.txt` から生成
- Google Doc単体で本文修正しない
- 修正はPipelineへ戻す

---

## 8. 再生成例外フロー

正式Doc生成後にGrounded correctionが必要になった場合:

```text
1. 音声 / sourceで誤認識確認
2. Alias / Boundary Ruleを追加
3. validator確認
4. Grounded Cleanup再実行
5. CLEAN_HHA確認
6. 既存Formal Docの扱いを人間が決定
7. Materializer Preview
8. Formal Doc再生成
9. Formal Doc人間確認
10. Integration Preview
```

既存Formal Docを自動削除しない。

---

## 9. Write Safety

Write処理では引き続き明示Targetを要求する。

ただし標準運用では、人間がScript Propertyへ日付を入力するのではなくTarget Lock Managerで設定する。

Write前にログで最低限確認する:

```text
targetMode / lock mode
Episode_Key
Recording_Date
Air_Date
Production_Status
warnings
```

`warnings` がある場合は内容を確認してから進める。

---

## 10. Failure / Fallback

OC-OSの最優先フェイルセーフ:

```text
システムが止まっても水曜に収録する
```

障害時:

- Notionが止まる → 手元の情報で収録
- Candidate Seederが止まる → 人間が選ぶ
- Studio Packがない → Notionまたは記憶・手元資料で収録
- ASRが止まる → 後日再実行
- Grounded Cleanupが止まる → machine evidenceを保持して後日再開
- Integratorが止まる → Notionへ無理に書かず、後日Previewから再開

録音そのものを後処理システムの成功条件に従属させない。

---

## 11. Standard Operation v1.0で採用する実装

主要モジュール:

```text
gas/oc_os_weekly_episode_bootstrap_v0.1.0.gs
gas/oc_os_target_episode_lock_manager_v0.1.0.gs
gas/ocos_studio_automation_v0.1.0.gs
gas/oc_os_post_recording_intake_v0.2.0.gs
gas/oc_os_transcript_materializer_v0.1.0.gs
gas/oc_os_post_recording_integrator_v0.1.0.gs
gas/oc_os_episode_completion_gate_v0.1.0.gs

transcription/transcribe_episode_v0.4.1.py
transcription/hha_clean_transcript.py
transcription/hha_transcription_terms.json
transcription/oc_transcription_terms.json
```

既存各Contractは維持する。

この文書は、それらを毎週どの順で運用するかを束ねる上位運用Contractとする。

---

## 12. 第118回PilotからStandard v1.0への変更点

```text
Pilot
  OC_TARGET_EPISODE_KEYを手入力

Standard v1.0
  Target Lock Managerから設定
```

```text
Pilot
  Formal Doc生成後の追加ASR誤認識で手順を確認しながら再生成

Standard v1.0
  Regeneration Flowを正式手順化
```

```text
Pilot
  Songs / Setlist / StructureをIntegration後に追加確認

Standard v1.0
  Actual Setlist / Structureを独立Human Gateとして明記
```

```text
Pilot
  Coverage gapの扱いをその場で判断

Standard v1.0
  「機械検出 → 実聴 → 意味欠落のみ対処」を明文化
```

---

## 13. Canonical Principle

OC-OS標準運用 v1.0の最終原則:

> 機械は漏れなく集め、安全に候補と記録を運ぶ。
> 人間は何を使い、何を話し、何を残すかを決める。
> システムは判断を奪わず、判断した事実を失わないようにする。
> そして、システムが止まっても放送制作は止めない。
