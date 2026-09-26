#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OC-OS Local Transcription Pilot v0.2.0

Purpose:
  - Preserve direct ASR output as RAW.
  - Improve recognition of OC/Hinatazaka proper nouns with glossary hotwords.
  - Re-split speech by real word-level time gaps so long music/silence regions
    do not become one giant transcript segment.
  - Produce a deterministic CLEAN draft without rewriting spoken content.

Input:
  UVR vocal stem or other speech-focused audio.

Output:
  - normalized 16 kHz mono PCM16 WAV
  - *_RAW.txt
  - *_CLEAN.txt
  - *_CLEAN.srt
  - *_CLEAN.vtt
  - *_TRANSCRIPT.json

Canonical safety:
  - RAW is never post-corrected.
  - CLEAN only changes segmentation, whitespace, and terminal punctuation.
  - CLEAN does not invent, summarize, or semantically rewrite speech.
  - Glossary terms are ASR hints, not factual sources.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

from faster_whisper import WhisperModel

VERSION = "0.2.0"

BASE_GLOSSARY = [
    "おひさまコネクト",
    "日向坂46",
    "おひさま",
    "あさくらじゅん",
    "DARAZ FM",
    "米子市",
    "鳥取県",
]

TERMINAL_PUNCTUATION = "。！？!?…"


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

    print("[1/4] 16 kHz mono PCM16 へ変換中...")
    subprocess.run(cmd, check=True)
    return output_path


def load_glossary(path: Path | None) -> list[str]:
    terms = list(BASE_GLOSSARY)

    if path is not None and path.exists():
        for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue

            # One term per line is preferred, but comma-separated input is accepted.
            pieces = re.split(r"[,，]", line)
            for piece in pieces:
                term = piece.strip()
                if term:
                    terms.append(term)

    seen = set()
    unique = []
    for term in terms:
        key = term.casefold()
        if key in seen:
            continue
        seen.add(key)
        unique.append(term)

    return unique


def build_initial_prompt(terms: list[str]) -> str:
    core = (
        "これはコミュニティFM番組「おひさまコネクト」の日本語音声です。"
        "日向坂46に関する固有名詞があります。"
    )
    if not terms:
        return core

    return core + " 固有名詞候補: " + "、".join(terms)


def build_hotwords(terms: list[str]) -> str | None:
    if not terms:
        return None
    return " ".join(terms)


def write_timestamped_txt(path: Path, segments: list[dict]) -> None:
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


def normalize_readable_text(text: str) -> str:
    text = re.sub(r"[ \t\r\n]+", " ", text).strip()

    # Remove artificial spaces between Japanese characters.
    jp = r"一-龯々〆ヵヶぁ-んァ-ヶー"
    text = re.sub(fr"(?<=[{jp}]) (?=[{jp}])", "", text)

    return text


def finalize_clean_text(text: str) -> str:
    text = normalize_readable_text(text)
    if not text:
        return text

    if text[-1] not in TERMINAL_PUNCTUATION:
        text += "。"

    return text


def flatten_words(raw_segments: list[dict]) -> list[dict]:
    words = []

    for seg in raw_segments:
        for word in seg.get("words", []) or []:
            start = word.get("start")
            end = word.get("end")
            text = word.get("word", "")

            if start is None or end is None or not text:
                continue

            words.append(
                {
                    "start": float(start),
                    "end": float(end),
                    "word": str(text),
                    "probability": word.get("probability"),
                }
            )

    words.sort(key=lambda x: (x["start"], x["end"]))
    return words


def build_clean_segments(
    raw_segments: list[dict],
    split_gap: float,
    max_utterance: float,
) -> list[dict]:
    words = flatten_words(raw_segments)

    if not words:
        return [
            {
                "id": i,
                "start": seg["start"],
                "end": seg["end"],
                "text": finalize_clean_text(seg["text"]),
                "source": "raw-segment-fallback",
            }
            for i, seg in enumerate(raw_segments)
            if seg.get("text", "").strip()
        ]

    clean = []
    bucket = []

    def flush() -> None:
        nonlocal bucket
        if not bucket:
            return

        text = finalize_clean_text("".join(w["word"] for w in bucket))
        if text:
            clean.append(
                {
                    "id": len(clean),
                    "start": float(bucket[0]["start"]),
                    "end": float(bucket[-1]["end"]),
                    "text": text,
                    "source": "word-gap-resplit",
                }
            )

        bucket = []

    for word in words:
        if not bucket:
            bucket.append(word)
            continue

        previous = bucket[-1]
        gap = max(0.0, word["start"] - previous["end"])
        duration = previous["end"] - bucket[0]["start"]
        previous_text = str(previous["word"]).strip()

        should_split = gap >= split_gap

        # Prevent extremely long readable paragraphs when natural punctuation exists.
        if (
            not should_split
            and duration >= max_utterance
            and previous_text
            and previous_text[-1] in TERMINAL_PUNCTUATION
        ):
            should_split = True

        if should_split:
            flush()

        bucket.append(word)

    flush()
    return clean


def main() -> int:
    parser = argparse.ArgumentParser(
        description="OC-OS Local Transcription Pilot v0.2.0"
    )

    parser.add_argument(
        "input",
        type=Path,
        help="UVR Vocals / Speech Stem audio",
    )
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
        "--glossary-file",
        type=Path,
        default=None,
        help="UTF-8 glossary file. One canonical term per line.",
    )
    parser.add_argument(
        "--split-gap",
        type=float,
        default=1.5,
        help="Start a new CLEAN utterance after this many seconds of word silence.",
    )
    parser.add_argument(
        "--max-utterance",
        type=float,
        default=22.0,
        help="Soft max CLEAN utterance length in seconds.",
    )
    parser.add_argument(
        "--no-normalize",
        action="store_true",
        help="Transcribe the input audio directly",
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

    script_dir = Path(__file__).resolve().parent
    default_glossary = script_dir / "glossary_hinatazaka.txt"

    glossary_file = args.glossary_file
    if glossary_file is None and default_glossary.exists():
        glossary_file = default_glossary

    glossary_terms = load_glossary(glossary_file)
    initial_prompt = build_initial_prompt(glossary_terms)
    hotwords = build_hotwords(glossary_terms)

    stem = input_path.stem
    audio_for_asr = input_path

    if not args.no_normalize:
        normalized = output_dir / f"{stem}_16k_mono.wav"
        audio_for_asr = normalize_audio(input_path, normalized)
    else:
        print("[1/4] 音声変換を省略します。")

    print(
        f"[2/4] model={args.model} device={args.device} "
        f"compute_type={compute_type} language={args.language}"
    )
    print(
        f"      glossary_terms={len(glossary_terms)} "
        f"split_gap={args.split_gap:.2f}s"
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
        initial_prompt=initial_prompt,
        hotwords=hotwords,
        word_timestamps=True,
    )

    raw_segments: list[dict] = []

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
            "words": [
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
                for w in (seg.words or [])
                if w.start is not None and w.end is not None
            ],
        }

        raw_segments.append(row)

    elapsed = time.time() - started

    print("[3/4] word timestampからCLEAN版を再分割中...")

    clean_segments = build_clean_segments(
        raw_segments,
        split_gap=args.split_gap,
        max_utterance=args.max_utterance,
    )

    base = output_dir / stem

    raw_txt = Path(str(base) + "_RAW.txt")
    clean_txt = Path(str(base) + "_CLEAN.txt")
    clean_srt = Path(str(base) + "_CLEAN.srt")
    clean_vtt = Path(str(base) + "_CLEAN.vtt")
    transcript_json = Path(str(base) + "_TRANSCRIPT.json")

    write_timestamped_txt(raw_txt, raw_segments)
    write_timestamped_txt(clean_txt, clean_segments)
    write_srt(clean_srt, clean_segments)
    write_vtt(clean_vtt, clean_segments)

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
        "glossary_file": str(glossary_file) if glossary_file else None,
        "glossary_terms": glossary_terms,
        "cleaning": {
            "mode": "deterministic-no-semantic-rewrite",
            "split_gap_seconds": args.split_gap,
            "max_utterance_seconds": args.max_utterance,
        },
        "raw_segments": raw_segments,
        "clean_segments": clean_segments,
    }

    transcript_json.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("[4/4] 完了")
    print(f"elapsed: {elapsed:.1f} sec")
    print(f"RAW  : {raw_txt}")
    print(f"CLEAN: {clean_txt}")
    print(f"SRT  : {clean_srt}")
    print(f"VTT  : {clean_vtt}")
    print(f"JSON : {transcript_json}")
    if not args.no_normalize:
        print(f"WAV  : {audio_for_asr}")

    print("")
    print("----- CLEAN PREVIEW -----")
    for seg in clean_segments[:30]:
        print(
            f"[{format_clock(seg['start'])} --> "
            f"{format_clock(seg['end'])}] {seg['text']}"
        )
    if len(clean_segments) > 30:
        print(f"... ({len(clean_segments) - 30} more segments)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
