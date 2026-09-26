# OC-OS Publication Pipeline

基準日: 2026-09-26

## Current modules

### Public Talk Audio Candidate

```text
build_talk_audio_candidate.py
```

Input:

```text
SPEECH_STEM.wav
*_TRANSCRIPT.json
```

Output:

```text
*_TALK_CANDIDATE.wav
*_TALK_EDIT.json
```

Example:

```powershell
python .\publication\build_talk_audio_candidate.py `
  "<SPEECH_STEM.wav>" `
  "<TRANSCRIPT.json>" `
  --output-dir "<PUBLICATION folder>"
```

Preview only:

```powershell
python .\publication\build_talk_audio_candidate.py `
  "<SPEECH_STEM.wav>" `
  "<TRANSCRIPT.json>" `
  --output-dir "<PUBLICATION folder>" `
  --dry-run
```

## Editing rule

The builder does not concatenate only recognized ASR sentences.

It identifies only long gaps between valid word timestamps and removes the interior of those gaps. Short gaps and unrecognized material inside talk blocks are preserved.

Default:

```text
music_gap_seconds = transcript cleaning.music_gap_seconds, otherwise 30.0
edge_pad_seconds = 1.0
join_silence_seconds = 0.25
```

## Output status

`TALK_CANDIDATE.wav` is not a publication master.

Human QC is mandatory before using it for a PUBLICATIONS record or external platform.

See:

```text
docs/OC-OS_PUBLIC_TALK_AUDIO_CONTRACT_v1.0.md
```

## Next stage

After cut logic is validated with real audio:

1. Human QC
2. Decide whether loudness normalization is needed
3. Decide final encoding profile per platform
4. Store final public-audio artifact in Drive
5. Connect it to PUBLICATIONS.Draft_URL / Public_URL as appropriate

Do not combine these stages before the cut/reconstruction logic is validated.
