# OC-OS Local Transcription — Current Entry

基準日: 2026-10-04

正式な成果物ルールは `docs/OC-OS_TRANSCRIPT_ARTIFACT_CONTRACT_v1.0.md` を正本とする。

## Current pipeline

```text
MASTER
  -> TRANSCRIPTION_PROXY
  -> UVR
  -> SPEECH_STEM
  -> transcribe_episode_v0.4.1.py
  -> TRANSCRIPT.json + AUDIT
  -> hha_clean_transcript.py
  -> CLEAN_HHA + correction evidence
  -> TRANSCRIPT/MACHINE
  -> GAS Transcript Materializer
  -> 正式Google Doc
```

## Current scripts

- Entry: `transcribe_episode_v0.4.1.py`
- Base dependency: `transcribe_episode_v0.4.0.py`
- Grounded cleanup: `hha_clean_transcript.py`
- Terms: `hha_transcription_terms.json`, `oc_transcription_terms.json`
- Python dependencies: `requirements.txt`

`transcribe_episode.py` is the older v0.3.0 Pilot entry and is not the current production entry.

## Output location

本運用ではASR・監査・補正証拠を対象EPISODEの次へ出力する。

```text
EPISODES/<Air_Date>/TRANSCRIPT/MACHINE/
```

`TRANSCRIPT/` 直下には、人間が通常開く正式Google Doc 1件だけを置く。

## Python virtual environment

`.venv` はローカルPC上の再生成可能な実行環境であり、EPISODE成果物ではない。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

`.venv`, `Lib`, `Scripts`, `Include`, `pyvenv.cfg` をGoogle Driveの `EPISODES/<date>/TRANSCRIPT/` に保存しない。

## Safety rules

- MASTERを上書きしない。
- `*_TRANSCRIPT.json` をPrimary ASRの機械証拠として保持する。
- Fuzzy補正・意味補完・言い換えをしない。
- HHA / OC-OSの明示Aliasと確認済みBoundary RuleだけをGrounded cleanupへ使う。
- 正式Google Docを単独で修正して正本化しない。必要な補正はPipelineへ戻して再生成する。

## Validated reference

第118回End-to-End Pilotの結果は `docs/OC-OS_TRANSCRIPT_ARTIFACT_CONTRACT_v1.0.md` および `docs/OC-OS_STANDARD_OPERATION_RUNTIME_VALIDATION_2026-10-04.md` を参照する。
