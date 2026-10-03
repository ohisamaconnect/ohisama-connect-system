# OC-OS Transcript Artifact Contract v1.0

基準日: 2026-09-26
更新: 2026-10-04 — 第118回End-to-End Pilot結果を反映

## 1. 目的

文字起こしPipelineで生成した成果物を、OC-OSのEPISODEへ安全に戻すための正式な成果物契約を定める。

このContractは、以下を両立させる。

- 機械証拠を失わない
- 人間が読みやすい正式Transcriptを持つ
- EPISODES.Transcript_URLを一意に決められる
- ASR誤認識修正と、人間による発言書き換えを混同しない
- 既存のPost-Recording Intake v0.2.0の安全設計を維持する

上位の週次運用Contractは `OC-OS_WEEKLY_STANDARD_OPERATION_v1.0.md` とする。

## 2. Canonical Folder Structure

```text
EPISODE/
  STUDIO/
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
      （必要時のみSRT/VTT等）
```

## 3. Artifact Roles

### MASTER

放送用完成音源。EPISODES.Audio_URLが参照するCanonical audio。

### TRANSCRIPT.json

Primary ASRの機械原記録。

segment / word timestamp等を保持し、後処理によって書き換えない。

### CLEAN_HHA.txt

Coverage First ASRに対して、HHA / OC-OSの明示Aliasと確認済みBoundary Ruleだけを適用した、人間が読むためのGrounded transcript source。

Fuzzy補正、意味補完、言い換え、姓からフルネームへの展開等は行わない。

### AUDIT / CORRECTION REPORT / CORRECTIONS JSON

Coverageおよび補正内容の監査証拠。

通常の人間参照先ではないが、Pipelineの検証可能性を維持するため保存する。

### 正式Google Doc

OC-OSから人間が通常開く正式Transcript artifact。

`*_CLEAN_HHA.txt` から生成し、EPISODES.Transcript_URLはこのGoogle Docを参照する。

Google Doc本文を独立した修正文書にしない。誤認識を直す場合はAlias / 明示Boundary Ruleへ戻り、Pipelineを再実行してから再生成する。

## 4. なぜTRANSCRIPT直下をGoogle Doc 1件に限定するか

Post-Recording Intake v0.2.0はTRANSCRIPT直下のTranscript候補を検査する。

CLEAN_HHA / AUDIT / PDF / Google Docs等を同じ階層に置くと候補が複数になり、Transcript_URLを安全に一意選択できなくなる。

そのため、機械成果物は`TRANSCRIPT/MACHINE`へ隔離し、TRANSCRIPT直下には正式Google Docだけを置く。

## 5. Implementation

### Existing

```text
gas/oc_os_post_recording_intake_v0.2.0.gs
```

役割:

- MASTERからAudio_URL候補を得る
- TRANSCRIPT直下の正式Transcriptを検査する
- 既存値を上書きしない
- Production_Statusを変更しない
- STUDIO ITEMSを変更しない

### Transcript Materializer

```text
gas/oc_os_transcript_materializer_v0.1.0.gs
```

主な関数:

```text
previewTranscriptMaterializerV01()
ensureTranscriptMachineFolderV01()
materializeFormalTranscriptDocV01()
```

MaterializerはNotionを書き換えない。

Drive/Docへ書く処理では `OC_TARGET_EPISODE_KEY` を必須とし、対象EPISODEを明示的に固定する。

標準運用ではScript Propertiesへ日付を手入力せず、次を使用する。

```text
gas/oc_os_target_episode_lock_manager_v0.1.0.gs
```

収録後対象:

```javascript
previewPostRecordingTargetLockV01()
lockPostRecordingTargetV01()
```

### Post-Recording Integrator

```text
gas/oc_os_post_recording_integrator_v0.1.0.gs
```

正式Google Doc生成後は、

```text
previewPostRecordingIntegrationV01()
syncPostRecordingIntegrationV01()
```

を使用する。

統合Writeは同一EPISODEに対して、使用済STUDIO ITEM由来の不足Relationと、空欄のAudio_URL / Transcript_URLだけを反映する。

## 6. Weekly Post-Recording Flow

```text
POST_RECORDING Target Preview
  ↓
Target Lock
  ↓
MASTER
  ↓
Post-Recording Intake folder structure
  ↓
TRANSCRIPTION_PROXY
  ↓
UVR
  ↓
SPEECH_STEM
  ↓
faster-whisper / Coverage First
  ↓
TRANSCRIPT.json + AUDIT
  ↓
HHA + OC grounded cleanup
  ↓
CLEAN_HHA + correction evidence
  ↓
TRANSCRIPT/MACHINEへ配置
  ↓
Transcript Materializer Preview
  ↓
正式Google Doc生成
  ↓
人間確認
  ↓
Post-Recording Integration Preview
  ↓
人間確認
  ↓
Actual Relations + Audio_URL + Transcript_URL sync
```

## 7. Pipeline Output Rule

`transcribe_episode_v0.4.1.py`は`--output-dir`を指定できる。

本運用では、ASR出力先を対象EPISODEの`TRANSCRIPT/MACHINE`とする。

`hha_clean_transcript.py`は入力TRANSCRIPT.jsonと同じディレクトリへCLEAN_HHA等を生成するため、同じMACHINEフォルダ内で成果物を完結できる。

## 8. Grounded Cleanup Rule

第118回PilotでvalidatorによるAlias target検査が実際に機能した。

標準ルール:

- Alias targetはCanonical / fixed termでなければならない
- Fuzzy rewriteをしない
- Semantic paraphraseをしない
- 文脈依存の一般文修正を固有名詞Aliasへ混ぜない
- 不確実なASR文を「正しそう」という理由だけで直さない

例:

```text
日立坂46 → 日向坂46
森本マリー → 森本茉莉
```

のようなGrounded correctionは許容する。

一方、文脈だけで推測する一般文補正はAliasへ入れない。

validatorが停止した場合はvalidatorを弱めず、辞書設計を見直す。

## 9. Coverage Audit Rule

Coverage gap検出 = Transcriptへ必ず文字を追加、ではない。

標準順序:

```text
Coverage gap検出
↓
該当音声を人間が実聴
↓
意味のある発話欠落か確認
↓
必要な場合だけ明示対応
```

フィラー、探索音、意味を持たない発声等であれば、人為的にTranscriptへ挿入しない。

## 10. Regeneration Rule

正式Google Docが既に存在する場合、Materializerは上書きしない。

修正が必要な場合は、以下を人間が確認してから再生成する。

1. 誤認識が本当にASR誤認識か音声/sourceで確認
2. 必要ならAlias / Boundary Ruleを追加
3. validatorを通す
4. Pipeline / Grounded Cleanupを再実行
5. 新CLEAN_HHAを確認
6. 既存正式Google Docの扱いを人間が決定
7. `previewTranscriptMaterializerV01()`
8. 新しい正式Docを生成
9. 新正式Docを人間確認
10. Post-Recording Integration Previewへ進む

自動で既存Docを削除・置換しない。

第118回Pilotではこのフローを実際に通し、正式Docを再生成できた。

## 11. Episode Actualsとの関係

Transcript IntegrationとEpisode Actuals Finalizerは別責務のまま維持し、Post-Recording Integratorが同一EPISODEへの反映を束ねる。

Episode Actuals Finalizerは、`Studio_Status = 使用済`だけを放送実績としてEVENT / SONG / SOURCE Relationへ反映する。

Transcriptから使用実績や発言内容を推測してRelationを確定しない。

特に曲間をMUSICCUTしているため、Transcriptだけでは実使用曲を完全に再構成できない場合がある。

Songs / Setlist_Memo / Structure_Memoの最終実績は人間確認で確定する。

両方が完了した状態で、収録後EPISODEは次の実績を持つ。

```text
Events
Songs
Sources
Studio_Items
Audio_URL
Transcript_URL
Structure_Memo
Setlist_Memo
```

Structure_Memo / Setlist_Memo / Production_Statusは自動確定しない。

## 12. 2026-10-04 End-to-End Pilot結果

対象:

```text
Episode_Key: 2026-10-04
Recording_Date: 2026-09-30
Air_Date: 2026-10-04
```

Pilotで実際に通過:

```text
Candidate Seeder
→ Studio Pack
→ 水曜収録
→ STUDIO ITEMS使用実績確定
→ MASTER格納
→ Proxy
→ UVR
→ Transcription Pipeline
→ Coverage Audit
→ CLEAN_HHA
→ Formal Google Doc
→ Grounded correction追加
→ Formal Google Doc再生成
→ Post-Recording Integration Preview
→ Actual Relations + Audio_URL + Transcript_URL
→ 実使用Songs / Setlist / Structure確定
```

Pilotでは `OC_TARGET_EPISODE_KEY` を手動設定したが、標準運用ではTarget Lock Managerへ置き換える。

## 13. 維持する原則

- MASTERは不変
- Primary ASRはCoverage First
- AIは発言を書き換えない
- ASR誤認識だけを補正する
- Fuzzy自動補正を行わない
- Alias target validationを維持する
- 機械証拠を残す
- Transcriptから放送実績を推測しない
- 既存値を勝手に上書きしない
- Production_Statusを勝手に変更しない
- 水曜収録をシステム依存にしない
- 最終判断はあさくらじゅんが行う
