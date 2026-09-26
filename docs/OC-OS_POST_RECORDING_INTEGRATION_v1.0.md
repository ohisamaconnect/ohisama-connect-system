# OC-OS Post-Recording Integration v1.0

基準日: 2026-09-26

## 1. 目的

収録後に確定する「放送実績」と「成果物リンク」を、同じEPISODEへ安全に戻す。

既存モジュールの責務は維持し、統合層で対象EPISODEだけを固定する。

## 2. Modules

```text
gas/oc_os_episode_actuals_finalizer_v0.1.0.gs
gas/oc_os_post_recording_intake_v0.2.0.gs
gas/oc_os_transcript_materializer_v0.1.0.gs
gas/oc_os_post_recording_integrator_v0.1.0.gs
```

### Episode Actuals Finalizer

`Studio_Status = 使用済` のSTUDIO ITEMSだけを放送実績として扱い、EVENT / SONG / SOURCEの不足RelationをEPISODESへ追加する。

既存Relationは削除しない。

### Post-Recording Intake

AUDIO/MASTERの一意な完成音源をAudio_URL候補とする。

TRANSCRIPT直下の一意な正式TranscriptをTranscript_URL候補とする。

既存URLは上書きしない。

### Transcript Materializer

`TRANSCRIPT/MACHINE/*_CLEAN_HHA.txt` から、人間参照用の正式Google DocをTRANSCRIPT直下へ生成する。

機械証拠と人間参照用Artifactを分離する。

### Post-Recording Integrator

上記のActualsとArtifact Linkを、同一EPISODEへまとめて反映する安全な統合層。

## 3. Target Safety

Preview:

```text
previewPostRecordingIntegrationV01()
```

`OC_TARGET_EPISODE_KEY` が設定済みならそのEPISODEを使う。

未設定時はPreviewに限り、既存のRecording_Date近傍選択を使用できる。

Write:

```text
syncPostRecordingIntegrationV01()
```

Write時はScript Property

```text
OC_TARGET_EPISODE_KEY
```

を必須とする。

例:

```text
OC_TARGET_EPISODE_KEY = 2026-10-04
```

一致するEPISODEが1件でなければ停止する。

これにより、複数モジュールがそれぞれ独立に「最寄りのEPISODE」を選び、異なる回へ書き込む危険を避ける。

## 4. Combined Write

統合Writeで許可するのは以下だけ。

```text
Events       ← 使用済STUDIO ITEMに由来する不足Relation
Songs        ← 使用済STUDIO ITEMに由来する不足Relation
Sources      ← 使用済STUDIO ITEMに由来する不足Relation
Audio_URL    ← 空欄時のみ、AUDIO/MASTERが一意なら設定
Transcript_URL ← 空欄時のみ、TRANSCRIPT直下の正式Google Docが一意なら設定
```

自動で変更しないもの:

```text
STUDIO ITEMSのStatus
Production_Status
Structure_Memo
Setlist_Memo
既存Relationsの削除
既存Audio_URLの上書き
既存Transcript_URLの上書き
MESSAGEの使用判定
発言内容
```

## 5. Transcript Contract

```text
TRANSCRIPT/
  <正式Google Doc 1件>
  MACHINE/
    *_TRANSCRIPT.json
    *_AUDIT.txt
    *_CLEAN_HHA.txt
    *_HHA_CORRECTION_REPORT.txt
    *_HHA_CORRECTIONS.json
```

正式Google DocはEPISODES.Transcript_URLの参照先。

`TRANSCRIPT.json`は機械証拠、`CLEAN_HHA.txt`はGrounded transcript sourceとして保持する。

## 6. End-to-End Order

```text
収録
↓
STUDIO ITEMSを人間が 使用済 / 保留 / 見送り に確定
↓
MASTERをAUDIO/MASTERへ格納
↓
TRANSCRIPTION_PROXY
↓
UVR → SPEECH_STEM
↓
Primary ASR / Coverage Audit
↓
HHA + OC grounded cleanup
↓
成果物をTRANSCRIPT/MACHINEへ配置
↓
previewTranscriptMaterializerV01()
↓
materializeFormalTranscriptDocV01()
↓
正式Google Docを人間確認
↓
OC_TARGET_EPISODE_KEYを対象回へ固定
↓
previewPostRecordingIntegrationV01()
↓
人間確認
↓
syncPostRecordingIntegrationV01()
↓
EPISODEへActual Relations + Audio_URL + Transcript_URL
```

## 7. 2026-10-04 Pilot

```text
Episode_Key: 2026-10-04
Recording_Date: 2026-09-30
Air_Date: 2026-10-04
```

PilotのWrite前にScript Propertyを以下へ固定する。

```text
OC_TARGET_EPISODE_KEY = 2026-10-04
```

収録前の現時点では、実績Relation・Audio_URL・Transcript_URLを確定しない。

## 8. Canonical Principle

Post-Recording Integrationは「実際に起きたことを記録する」工程であり、「何を使ったことにするか」をAIが決める工程ではない。

使用済判定、発言、意味付け、Structure_Memo、Setlist_Memoの最終判断はあさくらじゅんが行う。
