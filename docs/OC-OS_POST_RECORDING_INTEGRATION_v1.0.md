# OC-OS Post-Recording Integration v1.0

基準日: 2026-09-26
更新: 2026-10-04 — 第118回Pilot結果を標準運用へ反映

## 1. 目的

収録後に確定する「放送実績」と「成果物リンク」を、同じEPISODEへ安全に戻す。

既存モジュールの責務は維持し、統合層で対象EPISODEだけを固定する。

上位の週次運用Contractは `OC-OS_WEEKLY_STANDARD_OPERATION_v1.0.md` とする。

## 2. Modules

```text
gas/oc_os_episode_actuals_finalizer_v0.1.0.gs
gas/oc_os_post_recording_intake_v0.2.0.gs
gas/oc_os_transcript_materializer_v0.1.0.gs
gas/oc_os_post_recording_integrator_v0.1.0.gs
gas/oc_os_target_episode_lock_manager_v0.1.0.gs
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

### Target Episode Lock Manager

`OC_TARGET_EPISODE_KEY` を毎週人間がScript Propertiesへ入力する運用を廃止する。

収録後対象をPreviewし、人間確認後にSafety Lockとして設定する。

## 3. Target Safety

標準運用では、まずTarget Lock Managerを使う。

Preview:

```javascript
previewPostRecordingTargetLockV01()
```

Lock:

```javascript
lockPostRecordingTargetV01()
```

Lock Managerが既存互換用Script Property

```text
OC_TARGET_EPISODE_KEY
```

へ対象Episode_Keyを設定する。

通常運用ではProject Settingsからこの値を直接入力しない。

その後、Integration Preview:

```javascript
previewPostRecordingIntegrationV01()
```

Write:

```javascript
syncPostRecordingIntegrationV01()
```

Write時は従来どおり `OC_TARGET_EPISODE_KEY` を必須とする。

一致するEPISODEが1件でなければ停止する。

これにより、複数モジュールがそれぞれ独立に「最寄りのEPISODE」を選び、異なる回へ書き込む危険を避ける。

### Lockの位置づけ

`OC_TARGET_EPISODE_KEY` は週次設定値ではない。

**今このWrite処理をどのEPISODEへ向けるかを固定する一時Safety Lock** である。

収録前対象と収録後対象は同時に別EPISODEになり得るため、Weekly Bootstrapが新規EPISODEを作っただけでLockを自動切替しない。

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
previewPostRecordingTargetLockV01()
↓
lockPostRecordingTargetV01()
↓
previewTranscriptMaterializerV01()
↓
materializeFormalTranscriptDocV01()
↓
正式Google Docを人間確認
↓
previewPostRecordingIntegrationV01()
↓
人間確認
↓
syncPostRecordingIntegrationV01()
↓
EPISODEへActual Relations + Audio_URL + Transcript_URL
↓
実使用Songs / Setlist_Memo / Structure_Memoを人間確認で確定
```

Target LockはMaterializerとIntegratorの両方へ同じ対象回を与える。

## 7. 2026-10-04 Pilot結果

```text
Episode_Key: 2026-10-04
Recording_Date: 2026-09-30
Air_Date: 2026-10-04
```

Pilotでは `OC_TARGET_EPISODE_KEY = 2026-10-04` を手動で設定してEnd-to-Endを通した。

結果:

- Actual Events反映成功
- Audio_URL反映成功
- Transcript_URL反映成功
- Formal Transcript再生成フロー成功
- 実使用Songs 3件確定
- Setlist_Memo確定
- Structure_Memo確定
- Production_Statusその他の非対象項目を自動変更しないことを確認

Pilot後の標準運用では、手動Property入力をTarget Lock Managerへ置き換える。

## 8. Canonical Principle

Post-Recording Integrationは「実際に起きたことを記録する」工程であり、「何を使ったことにするか」をAIが決める工程ではない。

使用済判定、発言、意味付け、Structure_Memo、Setlist_Memoの最終判断はあさくらじゅんが行う。
