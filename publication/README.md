# OC-OS Publication Pipeline

基準日: 2026-09-26

## Current modules

### 1. Public Talk Audio Candidate

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

The builder does not concatenate only recognized ASR sentences. It identifies only long gaps between valid word timestamps and removes the interior of those gaps. Short gaps and unrecognized material inside talk blocks are preserved.

Default:

```text
music_gap_seconds = transcript cleaning.music_gap_seconds, otherwise 30.0
edge_pad_seconds = 1.0
join_silence_seconds = 0.25
```

`TALK_CANDIDATE.wav` is not a publication master. Human QC is mandatory.

See:

```text
docs/OC-OS_PUBLIC_TALK_AUDIO_CONTRACT_v1.0.md
```

### 2. Publication Context Pack

GAS:

```text
gas/oc_os_publication_context_builder_v0.1.0.gs
```

Flow:

```text
Official Transcript
+ EPISODE Actuals
+ Confirmed STATEMENTS
        ↓
*_PUBLICATION_CONTEXT.json
```

The builder does not summarize or write publication copy. It only packages already-existing post-recording evidence for the drafting layer.

Output location:

```text
EPISODE/TRANSCRIPT/MACHINE/<Episode_Key>_PUBLICATION_CONTEXT.json
```

WRITE requires:

```text
OC_TARGET_EPISODE_KEY
```

### 3. Publication Draft Prompt Builder

```text
build_publication_draft_prompt.py
```

Input:

```text
*_PUBLICATION_CONTEXT.json
PUBLICATION_DRAFT_PROMPT_CONTRACT_v1.0.md
```

Default draft-only targets:

```text
ショーノート | note
SNS投稿       | X
トーク音声    | Spotify
```

These are only material-generation targets. They are not instructions to publish.

Example:

```powershell
python .\publication\build_publication_draft_prompt.py `
  "<2026-10-04_PUBLICATION_CONTEXT.json>"
```

Custom targets can be supplied repeatedly:

```powershell
--target "SNS投稿|Instagram" --target "オーディオグラム|X"
```

Output:

```text
<Episode_Key>_PUBLICATION_DRAFT_PROMPT.txt
```

This script does not call an AI API. The prompt can be sent to Gemini, ChatGPT, or another model.

### 4. Publication Draft Artifact

The AI output must conform to:

```text
publication_drafts.schema.json
```

Artifact suffix:

```text
*_PUBLICATION_DRAFTS.json
```

Canonical rules:

```text
Publication_Key = stable identity of the intended external output
Draft_Key       = identity of the current AI-generated draft version
```

### 5. Publication Draft Importer

GAS:

```text
gas/oc_os_publication_draft_importer_v0.1.0.gs
```

Flow:

```text
*_PUBLICATION_DRAFTS.json
        ↓
Preview
        ↓
create-missing-only
        ↓
PUBLICATIONS
  Publication_Status = 下書き
  Origin             = AI下書き
```

Safety:

- WRITE requires `OC_TARGET_EPISODE_KEY`.
- Episode mismatch is BLOCK.
- Existing Publication_Key is never auto-updated.
- `Final_Text`, `Public_URL`, `Published_At` are never auto-filled.
- Long-form `ショーノート` drafts are materialized as Google Docs under `EPISODE/PUBLICATIONS` and linked by `Draft_URL`.
- Short-form drafts are stored in `AI_Draft_Text`.
- Human review happens in Notion `PUBLICATIONS / 05｜下書き確認`.

## Canonical draft flow

```text
Official Transcript
        +
EPISODE Actuals
        +
Confirmed STATEMENTS
        ↓
Publication Context Pack
        ↓
Provider-neutral Prompt
        ↓
AI Draft JSON
        ↓
Draft Import Preview
        ↓
PUBLICATIONS = 下書き
        ↓
あさくら確認・修正
        ↓
公開準備済
        ↓
外部公開
        ↓
公開済 + Public_URL + Published_At
```

AI never moves the record through the human approval boundary.

## Audio next stage

After talk-audio cut logic is validated with real audio:

1. Human QC
2. Decide whether loudness normalization is needed
3. Decide final encoding profile per platform
4. Store final public-audio artifact in Drive
5. Connect it to PUBLICATIONS.Draft_URL / Public_URL as appropriate

Do not combine these stages before the cut/reconstruction logic is validated.
