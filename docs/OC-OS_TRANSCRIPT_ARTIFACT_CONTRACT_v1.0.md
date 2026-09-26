# OC-OS Transcript Artifact Contract v1.0

基準日: 2026-09-26

## 1. 目的

文字起こしPipelineで生成した成果物を、OC-OSのEPISODEへ安全に戻すための正式な成果物契約を定める。

このContractは、以下を両立させる。

- 機械証拠を失わない
- 人間が読みやすい正式Transcriptを持つ
- EPISODES.Transcript_URLを一意に決められる
- ASR誤認識修正と、人間による発言書き換えを混同しない
- 既存のPost-Recording Intake v0.2.0の安全設計を維持する

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

- MASTERからAudio_URLを設定
- TRANSCRIPT直下の正式TranscriptからTranscript_URLを設定
- 既存値を上書きしない
- Production_Statusを変更しない
- STUDIO ITEMSを変更しない

### Added

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

正式Google Doc生成後、既存の

```text
previewPostRecordingIntakeV02()
syncPostRecordingLinksV02()
```

を使ってTranscript_URLへ接続する。

## 6. Weekly Post-Recording Flow

```text
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
Post-Recording Intake Preview
  ↓
Transcript_URL sync
```

## 7. Pipeline Output Rule

`transcribe_episode_v0.4.1.py`は`--output-dir`を指定できる。

本運用では、ASR出力先を対象EPISODEの`TRANSCRIPT/MACHINE`とする。

`hha_clean_transcript.py`は入力TRANSCRIPT.jsonと同じディレクトリへCLEAN_HHA等を生成するため、同じMACHINEフォルダ内で成果物を完結できる。

## 8. Regeneration Rule

正式Google Docが既に存在する場合、Materializerは上書きしない。

修正が必要な場合は、以下を人間が確認してから再生成する。

1. 誤認識が本当にASR誤認識か確認
2. 必要ならAlias / Boundary Ruleを追加
3. Pipelineを再実行
4. 新CLEAN_HHAを確認
5. 既存正式Google Docの扱いを人間が決定
6. その後に新しい正式Docを生成

自動で既存Docを削除・置換しない。

## 9. Episode Actualsとの関係

Transcript IntegrationとEpisode Actuals Finalizerは別責務とする。

Episode Actuals Finalizerは、`Studio_Status = 使用済`だけを放送実績としてEVENT / SONG / SOURCE Relationへ反映する。

Transcriptから使用実績や発言内容を推測してRelationを確定しない。

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

## 10. 2026-10-04 End-to-End Pilot

対象:

```text
Episode_Key: 2026-10-04
Recording_Date: 2026-09-30
Air_Date: 2026-10-04
```

この回で以下を通す。

```text
Candidate Seeder
→ Studio Pack
→ 水曜収録
→ STUDIO ITEMS使用実績確定
→ Episode Actuals Finalizer
→ MASTER格納
→ Post-Recording Intake
→ Proxy
→ UVR
→ Transcription Pipeline
→ CLEAN_HHA
→ TRANSCRIPT/MACHINE
→ Formal Google Doc
→ Transcript_URL
```

これをOC-OS最初のEnd-to-End Production Pilotとする。

## 11. 維持する原則

- MASTERは不変
- Primary ASRはCoverage First
- AIは発言を書き換えない
- ASR誤認識だけを補正する
- Fuzzy自動補正を行わない
- 機械証拠を残す
- Transcriptから放送実績を推測しない
- 既存値を勝手に上書きしない
- Production_Statusを勝手に変更しない
- 水曜収録をシステム依存にしない
- 最終判断はあさくらじゅんが行う
