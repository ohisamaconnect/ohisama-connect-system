# OC-OS Local Transcription Pilot v0.2.0

## Purpose

Episode audio is transcribed locally while preserving the MASTER timeline.

Canonical flow:

```
MASTER
  -> TRANSCRIPTION_PROXY
  -> Ultimate Vocal Remover
  -> UVR Vocals
  -> 16 kHz mono PCM16 SPEECH_STEM
  -> faster-whisper large-v3
  -> RAW transcript
  -> deterministic CLEAN draft
```

RAW is the direct ASR record. CLEAN changes only segmentation, whitespace, and terminal punctuation. It does not summarize or semantically rewrite speech.

## Current Pilot profile

- faster-whisper: 1.2.1
- Model: `large-v3`
- Device: NVIDIA CUDA
- Compute type: `int8_float16`
- Language: `ja`
- Beam size: 5
- VAD: enabled
- Word timestamps: always enabled
- `condition_on_previous_text=False`
- Glossary: `glossary_hinatazaka.txt`

Validated local environment:

- Windows
- Python 3.14.7
- RTX 4060 8 GB
- CUDA Toolkit 12.9
- cuDNN 9

## PowerShell setup

Create the virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Activation is optional. If PowerShell execution policy blocks `Activate.ps1`, use `.\.venv\Scripts\python.exe` directly.

GPU check:

```powershell
.\.venv\Scripts\python.exe -c "import ctranslate2; print('CUDA devices:', ctranslate2.get_cuda_device_count())"
```

Expected:

```
CUDA devices: 1
```

## Episode 78 Pilot

Input:

```
1_PK12281930-おひさまコネクト78回_MUSICCUT_(Vocals).wav
```

Run:

```powershell
.\.venv\Scripts\python.exe .\transcribe_episode.py "G:\マイドライブ\OC-OS\EPISODES\2025-12-28\AUDIO\1_PK12281930-おひさまコネクト78回_MUSICCUT_(Vocals).wav" --model large-v3 --device cuda --compute-type int8_float16 --language ja
```

Optional tuning:

- `--split-gap 1.5` : CLEAN starts a new utterance after this word-level silence.
- `--max-utterance 22` : soft maximum utterance length when punctuation allows.
- `--glossary-file <path>` : use another UTF-8 glossary.

## Output

- `*_16k_mono.wav` — normalized speech input
- `*_RAW.txt` — direct ASR segments, unchanged
- `*_CLEAN.txt` — word-gap resegmented readable draft
- `*_CLEAN.srt` — CLEAN subtitle/timecode form
- `*_CLEAN.vtt` — CLEAN web timecode form
- `*_TRANSCRIPT.json` — RAW + CLEAN + word timestamps + model/config metadata

## Glossary

The bundled `glossary_hinatazaka.txt` is a starter ASR hint list. It is not a factual source.

Future direction: generate episode-specific terms from HHA and EPISODE relations instead of sending the entire archive vocabulary to Whisper every week.

## Pilot evaluation

Compare v0.2.0 with the v0.1.0 Episode 78 result:

1. Recognition of 日向坂46 and member names
2. Whether music/silence gaps are separated correctly
3. Readability of CLEAN
4. Timestamp alignment against MASTER
5. Hallucination in silent/music-cut regions
6. Processing time and VRAM stability

Do not treat one Pilot result as Production approval. The purpose is to establish the weekly transcription contract.
