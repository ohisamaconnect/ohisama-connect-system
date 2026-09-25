# OC-OS Local Transcription Pilot v0.1.0

## Purpose

This Pilot transcribes an OC-OS `SPEECH_STEM` locally on the production PC.

Canonical flow:

```
MASTER
  -> TRANSCRIPTION_PROXY
  -> Ultimate Vocal Remover
  -> UVR Vocals
  -> 16 kHz mono PCM16 SPEECH_STEM
  -> faster-whisper large-v3
  -> TXT / SRT / VTT / JSON
```

The script does not decide program structure, broadcast adoption, or editorial meaning.

## Current recommended profile

- Python: 3.11 or 3.12
- faster-whisper: 1.2.1
- Model: `large-v3`
- Device: NVIDIA CUDA
- Compute type: `int8_float16`
- Language: `ja`
- Beam size: 5
- VAD: enabled
- `condition_on_previous_text=False`

The current faster-whisper GPU stack requires CUDA 12 cuBLAS and cuDNN 9.

## Windows setup

Create an isolated virtual environment:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Confirm CTranslate2 can see the GPU:

```powershell
python -c "import ctranslate2; print('CUDA devices:', ctranslate2.get_cuda_device_count())"
```

Expected on the OC production PC:

```
CUDA devices: 1
```

If this returns 0 or model loading fails, verify the NVIDIA driver plus CUDA 12 / cuDNN 9 runtime libraries before changing transcription settings.

## Episode 78 Pilot

Input:

```
1_PK12281930-おひさまコネクト78回_MUSICCUT_(Vocals).wav
```

Run:

```powershell
python transcribe_episode.py `
  "D:\\path\\to\\1_PK12281930-おひさまコネクト78回_MUSICCUT_(Vocals).wav" `
  --model large-v3 `
  --device cuda `
  --compute-type int8_float16 `
  --language ja `
  --word-timestamps
```

The first run downloads the model, so network access is required once.

## Output

The script creates:

- `*_16k_mono.wav` — candidate canonical SPEECH_STEM
- `*_TRANSCRIPT.txt` — human review with timestamps
- `*_TRANSCRIPT.srt` — subtitle/timecode interchange
- `*_TRANSCRIPT.vtt` — web-friendly timecode interchange
- `*_TRANSCRIPT.json` — machine-readable archive

The JSON keeps model/config metadata and segment timestamps so later OC-OS processing can be reproduced and audited.

## Glossary / names

Use a UTF-8 text file with `--prompt-file` when testing HHA member names, song names, show-specific terms, etc.

Example:

```text
小坂菜緒、金村美玖、正源司陽子、藤嶌果歩、髙橋未来虹
おひさま、ひなあい、日向坂ちゃんねる
```

Do not treat the glossary as a factual source. It is only an ASR spelling hint.

## Pilot evaluation

For Episode 78, evaluate:

1. Normal Japanese sentence accuracy
2. Hinatazaka46 names and proper nouns
3. Segment timestamps against MASTER
4. Hallucination in long silence / music-cut sections
5. Residual BGM or UVR artifacts
6. Processing time and VRAM stability
7. Whether the generated TXT is readable enough for archive cleanup

Do not change the canonical weekly pipeline from this one sample alone. Use the result to decide whether the profile should become Production.
