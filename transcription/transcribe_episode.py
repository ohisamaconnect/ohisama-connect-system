#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OC-OS Local Transcription Pilot v0.3.0

Purpose:
- Preserve direct faster-whisper output as RAW.
- Improve recognition with glossary initial_prompt + hotwords.
- Build CLEAN with a RAW-preserving hybrid strategy:
  keep Whisper's normal segment boundaries, and only re-split a RAW segment
  when a very large word-level silence indicates a music/silence section.
- Preserve MASTER timeline.

Safety:
- RAW is immutable ASR output.
- CLEAN does not summarize or semantically rewrite speech.
- Glossary terms are recognition hints, not factual sources.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import shutil
import site
import subprocess
import sys
import time
from pathlib import Path

VERSION = "0.3.0"

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


def configure_windows_gpu_dlls() -> list[str]:
    if os.name != "nt":
        return []

    candidates: list[str] = []
    cuda_path = os.environ.get("CUDA_PATH")
    if cuda_path:
        candidates.append(str(Path(cuda_path) / "bin"))

    try:
        site_dirs = site.getsitepackages()
    except Exception:
        site_dirs = []

    for root in site_dirs:
        candidates.extend(
            glob.glob(str(Path(root) / "nvidia" / "cudnn" / "bin"))
        )

    added: list[str] = []
    seen = set()

    for raw in candidates:
        path = str(Path(raw).resolve())
        key = path.casefold()
        if key in seen or not Path(path).is_dir():
            continue
        seen.add(key)

        try:
            os.add_dll_directory(path)
        except (AttributeError, FileNotFoundError, OSError):
            pass

        os.environ["PATH"] = path + os.pathsep + os.environ.get("PATH", "")
        added.append(path)

    return added


def format_clock(seconds: float, sep: str = ".") -> str:
    seconds = max(0.0, seconds)
    ms_total = int(round(seconds * 1000))
    hours, rem = divmod(ms_total, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}{sep}{ms:03d}"


def normalize_audio(input_path: Path, output_path: Path) -> Path:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg が PATH にありません。")

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
            for piece in re.split(r"[,，]", line):
                term = piece.strip()
                if term:
                    terms.append(term)

    unique: list[str] = []
    seen = set()
    for term in terms:
        key = term.casefold()
        if key in seen:
            continue
        seen.add(key)
        unique.append(term)
    return unique


def build_initial_prompt(terms: list[str]) -> str:
    core = (
        "これはコミュニティFM番組『おひさまコネクト』の日本語音声です。"
        "日向坂46に関する固有名詞があります。"
    )
    return core + (" 固有名詞候補: " + "、".join(terms) if terms else "")


def build_hotwords(terms: list[str]) -> str | None:
    return " ".join(terms) if terms else None


def normalize_readable_text(text: str) -> str:
    return re.sub(r"[ \t\r\n]+", " ", text).strip()


def finalize_clean_text(text: str) -> str:
    text = normalize_readable_text(text)
    if text and text[-1] not in TERMINAL_PUNCTUATION:
        text += "。"
    return text


def valid_words(seg: dict) -> list[dict]:
    words = []
    for word in seg.get("words", []) or []:
        if (
            word.get("start") is None
            or word.get("end") is None
            or not str(word.get("word", ""))
        ):
            continue
        words.append(word)
    return words


def max_internal_gap(words: list[dict]) -> float:
    if len(words) < 2:
        return 0.0
    return max(
        max(0.0, float(b["start"]) - float(a["end"]))
        for a, b in zip(words, words[1:])
    )


def split_words_on_large_gap(words: list[dict], threshold: float) -> list[list[dict]]:
    if not words:
        return []

    groups: list[list[dict]] = [[words[0]]]
    for previous, current in zip(words, words[1:]):
        gap = max(0.0, float(current["start"]) - float(previous["end"]))
        if gap >= threshold:
            groups.append([])
        groups[-1].append(current)
    return [g for g in groups if g]


def build_clean_segments(raw_segments: list[dict], music_gap: float) -> list[dict]:
    """
    Hybrid CLEAN:
    - Normal RAW segment: preserve ASR text and boundaries.
    - RAW segment containing a very large internal word gap: split only there.

    This prevents the v0.2.x failure where all speech was rebuilt from words and
    normal sentence segmentation was lost.
    """
    clean: list[dict] = []

    for raw in raw_segments:
        raw_text = normalize_readable_text(raw.get("text", ""))
        if not raw_text:
            continue

        words = valid_words(raw)
        biggest_gap = max_internal_gap(words)

        if biggest_gap < music_gap or len(words) < 2:
            clean.append({
                "id": len(clean),
                "start": float(raw["start"]),
                "end": float(raw["end"]),
                "text": raw_text,
                "source": "raw-preserved",
                "max_internal_gap": biggest_gap,
            })
            continue

        groups = split_words_on_large_gap(words, music_gap)
        for group in groups:
            text = finalize_clean_text("".join(str(w["word"]) for w in group))
            if not text:
                continue
            clean.append({
                "id": len(clean),
                "start": float(group[0]["start"]),
                "end": float(group[-1]["end"]),
                "text": text,
                "source": "music-gap-split",
                "max_internal_gap": biggest_gap,
            })

    return clean


def write_timestamped_txt(path: Path, segments: list[dict]) -> None:
    lines = []
    for seg in segments:
        lines.append(
            f"[{format_clock(seg['start'])} --> {format_clock(seg['end'])}] "
            f"{seg['text'].strip()}"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_srt(path: Path, segments: list[dict]) -> None:
    blocks = []
    for i, seg in enumerate(segments, 1):
        blocks.append(
            f"{i}\n"
            f"{format_clock(seg['start'], ',')} --> {format_clock(seg['end'], ',')}\n"
            f"{seg['text'].strip()}\n"
        )
    path.write_text("\n".join(blocks), encoding="utf-8")


def write_vtt(path: Path, segments: list[dict]) -> None:
    blocks = ["WEBVTT\n"]
    for seg in segments:
        blocks.append(
            f"{format_clock(seg['start'])} --> {format_clock(seg['end'])}\n"
            f"{seg['text'].strip()}\n"
        )
    path.write_text("\n".join(blocks), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="OC-OS Local Transcription Pilot v0.3.0"
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--model", default="large-v3")
    parser.add_argument("--device", choices=["cuda", "cpu"], default="cuda")
    parser.add_argument("--compute-type", default=None)
    parser.add_argument("--language", default="ja")
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument("--glossary-file", type=Path, default=None)
    parser.add_argument(
        "--music-gap",
        type=float,
        default=30.0,
        help="Only split a RAW segment when word silence reaches this many seconds.",
    )
    parser.add_argument("--no-normalize", action="store_true")
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
    glossary_file = args.glossary_file or (
        default_glossary if default_glossary.exists() else None
    )
    glossary_terms = load_glossary(glossary_file)

    stem = input_path.stem
    audio_for_asr = input_path
    if not args.no_normalize:
        audio_for_asr = normalize_audio(
            input_path,
            output_dir / f"{stem}_16k_mono.wav",
        )
    else:
        print("[1/4] 音声変換を省略します。")

    dll_dirs = configure_windows_gpu_dlls()
    if dll_dirs:
        print("      GPU DLL dirs:")
        for d in dll_dirs:
            print(f"        - {d}")

    from faster_whisper import WhisperModel

    print(
        f"[2/4] version={VERSION} model={args.model} device={args.device} "
        f"compute_type={compute_type} language={args.language}"
    )
    print(
        f"      glossary_terms={len(glossary_terms)} "
        f"music_gap={args.music_gap:.1f}s"
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
        initial_prompt=build_initial_prompt(glossary_terms),
        hotwords=build_hotwords(glossary_terms),
        word_timestamps=True,
    )

    raw_segments: list[dict] = []
    for seg in segments_gen:
        raw_segments.append({
            "id": int(seg.id),
            "start": float(seg.start),
            "end": float(seg.end),
            "text": seg.text.strip(),
            "avg_logprob": (
                float(seg.avg_logprob) if seg.avg_logprob is not None else None
            ),
            "no_speech_prob": (
                float(seg.no_speech_prob) if seg.no_speech_prob is not None else None
            ),
            "words": [
                {
                    "start": float(w.start),
                    "end": float(w.end),
                    "word": w.word,
                    "probability": (
                        float(w.probability) if w.probability is not None else None
                    ),
                }
                for w in (seg.words or [])
                if w.start is not None and w.end is not None
            ],
        })

    elapsed = time.time() - started

    print("[3/4] RAWを尊重し、楽曲またぎだけHybrid分割中...")
    clean_segments = build_clean_segments(raw_segments, args.music_gap)

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

    transcript_json.write_text(
        json.dumps({
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
                "mode": "hybrid-raw-preserving",
                "music_gap_seconds": args.music_gap,
            },
            "raw_segments": raw_segments,
            "clean_segments": clean_segments,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("[4/4] 完了")
    print(f"elapsed: {elapsed:.1f} sec")
    print(f"RAW  : {raw_txt}")
    print(f"CLEAN: {clean_txt}")
    print(f"SRT  : {clean_srt}")
    print(f"VTT  : {clean_vtt}")
    print(f"JSON : {transcript_json}")

    print("\n----- CLEAN PREVIEW -----")
    for seg in clean_segments[:40]:
        print(
            f"[{format_clock(seg['start'])} --> {format_clock(seg['end'])}] "
            f"{seg['text']}"
        )
    if len(clean_segments) > 40:
        print(f"... ({len(clean_segments) - 40} more segments)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
