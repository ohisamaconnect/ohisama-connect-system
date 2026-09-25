#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OC-OS Local Transcription Pilot v0.1.0

Input:
  UVR vocal stem or other speech-focused audio.

Output:
  - normalized 16 kHz mono PCM16 WAV (optional but recommended)
  - timestamped TXT
  - SRT
  - VTT
  - JSON

Design principles:
  - Preserve the source timeline.
  - Japanese transcription only; no translation.
  - Use VAD to reduce hallucinations in long silent/music-cut sections.
  - Do not infer program structure or editorial meaning.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

from faster_whisper import WhisperModel

VERSION = "0.1.0"


def format_clock(seconds: float, sep: str = ".") -> str:
    if seconds < 0:
        seconds = 0.0
    ms_total = int(round(seconds * 1000))
    hours, rem = divmod(ms_total, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}{sep}{ms:03d}"


def normalize_audio(input_path: Path, output_path: Path) -> Path:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError(
            "ffmpeg が PATH にありません。"
            " --no-normalize を使うか、ffmpeg をインストールしてください。"
        )

    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel", "warning",
        "-y",
        "-i", str(input_path),
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "pcm_s16le",
        str(output_path),
    ]

    print("[1/3] 16 kHz mono PCM16 へ変換中...")
    subprocess.run(cmd, check=True)
    return output_path


def load_prompt(prompt_file: Path | None) -> str:
    base = "おひさまコネクト。日向坂46。あさくらじゅん。"
    if not prompt_file:
        return base

    text = prompt_file.read_text(encoding="utf-8").strip()
    if not text:
        return base

    return base + "\n" + text


def write_txt(path: Path, segments: list[dict]) -> None:
    lines = []
    for seg in segments:
        start = format_clock(seg["start"])
        end = format_clock(seg["end"])
        lines.append(f"[{start} --> {end}] {seg['text'].strip()}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_srt(path: Path, segments: list[dict]) -> None:
    blocks = []
    for i, seg in enumerate(segments, 1):
        start = format_clock(seg["start"], ",")
        end = format_clock(seg["end"], ",")
        blocks.append(
            f"{i}\n{start} --> {end}\n{seg['text'].strip()}\n"
        )
    path.write_text("\n".join(blocks), encoding="utf-8")


def write_vtt(path: Path, segments: list[dict]) -> None:
    blocks = ["WEBVTT\n"]
    for seg in segments:
        start = format_clock(seg["start"])
        end = format_clock(seg["end"])
        blocks.append(f"{start} --> {end}\n{seg['text'].strip()}\n")
    path.write_text("\n".join(blocks), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="OC-OS Local Transcription Pilot"
    )
    parser.add_argument("input", type=Path, help="UVR Vocals / Speech Stem audio")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Output directory. Default: input file directory",
    )
    parser.add_argument("--model", default="large-v3")
    parser.add_argument(
        "--device",
        choices=["cuda", "cpu"],
        default="cuda",
    )
    parser.add_argument(
        "--compute-type",
        default=None,
        help="Default: cuda=int8_float16, cpu=int8",
    )
    parser.add_argument("--language", default="ja")
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument(
        "--prompt-file",
        type=Path,
        default=None,
        help="Optional UTF-8 glossary / initial prompt file",
    )
    parser.add_argument(
        "--no-normalize",
        action="store_true",
        help="Transcribe the input audio directly",
    )
    parser.add_argument(
        "--word-timestamps",
        action="store_true",
        help="Store word-level timestamps in JSON",
    )
    args = parser.parse_args()

    input_path = args.input.expanduser().resolve()
    if not input_path.exists():
        print(f"ERROR: input not found: {input_path}", file=sys.stderr)
        return 2

    output_dir = (
        args.output_dir.expanduser().resolve()
        if args.output_dir
        else input_path.parent
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    compute_type = args.compute_type or (
        "int8_float16" if args.device == "cuda" else "int8"
    )

    stem = input_path.stem
    audio_for_asr = input_path

    if not args.no_normalize:
        normalized = output_dir / f"{stem}_16k_mono.wav"
        audio_for_asr = normalize_audio(input_path, normalized)
    else:
        print("[1/3] 音声変換を省略します。")

    prompt = load_prompt(args.prompt_file)

    print(
        f"[2/3] model={args.model} device={args.device} "
        f"compute_type={compute_type} language={args.language}"
    )

    model = WhisperModel(
        args.model,
        device=args.device,
        compute_type=compute_type,
    )

    started = time.time()

    segments_gen, info = model.transcribe(
        str(audio_for_asr),
        language=args.language,
        task="transcribe",
        beam_size=args.beam_size,
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=500,
            speech_pad_ms=250,
        ),
        condition_on_previous_text=False,
        initial_prompt=prompt,
        word_timestamps=args.word_timestamps,
    )

    segments: list[dict] = []

    for seg in segments_gen:
        row = {
            "id": int(seg.id),
            "start": float(seg.start),
            "end": float(seg.end),
            "text": seg.text.strip(),
            "avg_logprob": (
                float(seg.avg_logprob)
                if seg.avg_logprob is not None
                else None
            ),
            "no_speech_prob": (
                float(seg.no_speech_prob)
                if seg.no_speech_prob is not None
                else None
            ),
        }

        if args.word_timestamps and seg.words:
            row["words"] = [
                {
                    "start": float(w.start),
                    "end": float(w.end),
                    "word": w.word,
                    "probability": (
                        float(w.probability)
                        if w.probability is not None
                        else None
                    ),
                }
                for w in seg.words
            ]

        segments.append(row)
        print(
            f"[{format_clock(row['start'])} --> "
            f"{format_clock(row['end'])}] {row['text']}"
        )

    elapsed = time.time() - started

    base = output_dir / f"{stem}_TRANSCRIPT"

    write_txt(base.with_suffix(".txt"), segments)
    write_srt(base.with_suffix(".srt"), segments)
    write_vtt(base.with_suffix(".vtt"), segments)

    payload = {
        "pipeline": "OC-OS Local Transcription Pilot",
        "version": VERSION,
        "input": str(input_path),
        "audio_for_asr": str(audio_for_asr),
        "model": args.model,
        "device": args.device,
        "compute_type": compute_type,
        "language_requested": args.language,
        "language_detected": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "duration": getattr(info, "duration", None),
        "duration_after_vad": getattr(info, "duration_after_vad", None),
        "elapsed_seconds": elapsed,
        "segments": segments,
    }

    base.with_suffix(".json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("[3/3] 完了")
    print(f"elapsed: {elapsed:.1f} sec")
    print(f"TXT : {base.with_suffix('.txt')}")
    print(f"SRT : {base.with_suffix('.srt')}")
    print(f"VTT : {base.with_suffix('.vtt')}")
    print(f"JSON: {base.with_suffix('.json')}")
    if not args.no_normalize:
        print(f"WAV : {audio_for_asr}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
