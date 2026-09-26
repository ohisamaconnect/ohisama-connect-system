# OC-OS Public Talk Audio Contract v1.0

基準日: 2026-09-26

## 1. 目的

放送用MASTERとは別に、二次公開候補となる「トークのみ音声」を生成するための契約を定める。

この工程は放送MASTERを変更しない。

## 2. Source Artifacts

```text
SPEECH_STEM.wav
TRANSCRIPT.json
```

### SPEECH_STEM

UVRで生成した音声分離成果物。

文字起こし用中間成果物であり、そのまま公開物とはみなさない。

### TRANSCRIPT.json

MASTER timelineを維持したASRのsegment / word timestampを持つ。

## 3. なぜASR文単位で切り貼りしないか

Primary ASRはCoverage Firstだが、ASRが100%すべての発言を認識する保証はない。

認識されたsegmentだけを抽出すると、ASRが落とした実際の発言まで公開候補音源から消える危険がある。

したがって初期設計では、ASR timestampを「発言だけを選ぶ」用途ではなく、**長い楽曲区間を特定するためだけ**に使う。

## 4. Long-Gap Cut Rule

TRANSCRIPT.jsonのword timestampを時系列で並べる。

隣接する有効word間に長いgapがある場合、そのgapを「フル楽曲／長い非発話区間の候補」とする。

初期基準:

```text
music_gap_seconds = 30.0
```

これはTranscription Pipelineのmusic-gap概念と揃える。

30秒未満の無音・間・ASR未認識部分は自動削除しない。

## 5. Preserve Talk Blocks

長いgapとgapの間は、ASR認識の有無にかかわらずブロック全体を残す。

これにより、短い未認識発話を自動で切り落としにくくする。

長いgapの境界にはpaddingを残す。

初期値:

```text
edge_pad_seconds = 1.0
```

## 6. Output

初期成果物:

```text
*_TALK_CANDIDATE.wav
*_TALK_EDIT.json
```

### TALK_CANDIDATE.wav

公開前の人間確認用候補音源。

公開MASTERではない。

### TALK_EDIT.json

以下を記録する。

- source speech stem
- source transcript JSON
- transcript pipeline version
- music gap threshold
- edge padding
- keep intervals
- cut intervals
- source / output duration
- warnings

## 7. Human QC Required

TALK_CANDIDATEは自動でPUBLICATIONS.Public_URLへ接続しない。

公開前に人間が全編を確認する。

確認対象:

- 発言が欠落していないか
- 語頭・語尾が切れていないか
- 曲・BGMの分離残りが過度にないか
- 不自然な長い無音がないか
- 接続部が不自然でないか
- 公開しない方がよい発言がないか

## 8. Rights Boundary

このPipelineは「楽曲を含まない二次公開候補」を作るための技術的支援である。

UVR分離や自動cutによって、権利処理上の安全性が自動的に保証されるとは扱わない。

公開可否は人間が最終確認する。

## 9. Loudness / Encoding

v1.0では、切り出しと再構成を先に安定させる。

ラウドネス正規化、EQ、コンプレッション、最終MP3/AAC encodeは別工程とする。

理由:

- 音声内容の欠落検証と音質処理を分離する
- 問題発生時の原因を切り分けやすくする

## 10. PUBLICATIONSとの接続

人間QC後に必要であれば、PUBLICATIONSへ以下を記録する。

```text
Output_Type = トーク音声
Platform = Spotify 等
Publication_Status = 下書き / 確認待ち / 公開準備済
Draft_URL = 公開候補音源またはその格納先
```

AI/GASは `公開済` を自動確定しない。

## 11. Initial Pilot

Episode 78の既存Transcription成果物は設計検証に利用できる。

実音源がローカル環境で利用可能になった時点で、Episode 78を最初のTalk Audio Candidate検証素材とする。

2026-10-04回は、Post-Recording End-to-End Pilotの後に同じ工程を通す。
