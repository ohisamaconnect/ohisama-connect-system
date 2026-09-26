#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OC-OS Local Transcription Pilot v0.4.1

Changes from v0.4.0:
- Do not generate *_RAW.txt. Raw ASR evidence remains inside *_TRANSCRIPT.json.
- Human-facing transcript is *_CLEAN.txt.
- Coverage audit ignores low-text-density warnings when the same ASR segment
  clearly spans a long music/silence gap.
- Keep coverage-first primary ASR. HHA proper-noun correction remains a later layer.

Human-facing outputs:
  *_CLEAN.txt
  *_CLEAN.srt
  *_CLEAN.vtt
  *_AUDIT.txt

Machine evidence:
  *_TRANSCRIPT.json
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
from pathlib import Path

VERSION = "0.4.1"
BASE_FILE = Path(__file__).with_name("transcribe_episode_v0.4.0.py")


def load_base():
    spec = importlib.util.spec_from_file_location("oc_transcription_v040", BASE_FILE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load base module: {BASE_FILE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def suspicious_segments_v041(base, raw_segments: list[dict], max_word_duration: float, music_gap: float) -> list[dict]:
    """Flag suspicious ASR while treating long music/silence spans as expected."""
    warnings = []

    for seg in raw_segments:
        duration = max(0.0, float(seg["end"]) - float(seg["start"]))
        text = base.normalize_readable_text(seg.get("text", ""))
        words = base.valid_words(seg)
        biggest_gap = base.max_internal_gap(words)
        longest_word = max(
            [max(0.0, float(w["end"]) - float(w["start"])) for w in words] or [0.0]
        )
        chars_per_second = len(text) / duration if duration > 0 else 999.0

        reasons = []

        # A single word spanning many seconds is still suspicious even around music.
        if longest_word > max_word_duration:
            reasons.append(f"word timestamp spans {longest_word:.1f}s")

        # Low text density is expected when a segment bridges an intentionally
        # silent/full-song region, so do not warn in that case.
        if (
            duration >= 8.0
            and chars_per_second < 0.8
            and biggest_gap < music_gap
        ):
            reasons.append(f"very low text density ({chars_per_second:.2f} chars/s)")

        if reasons:
            warnings.append({
                "start": float(seg["start"]),
                "end": float(seg["end"]),
                "text": text,
                "reasons": reasons,
                "max_internal_gap": biggest_gap,
            })

    return warnings


def build_audit_v041(
    base,
    normalized_wav: Path,
    raw_segments: list[dict],
    active_dbfs: float,
    uncovered_min_seconds: float,
    max_word_duration: float,
    music_gap: float,
) -> dict:
    sample_rate, frames = base.wav_rms_frames(normalized_wav)
    intervals = base.meaningful_word_intervals(raw_segments, max_word_duration)
    uncovered = base.group_uncovered_active_frames(
        frames,
        intervals,
        active_dbfs,
        uncovered_min_seconds,
    )
    suspicious = suspicious_segments_v041(
        base,
        raw_segments,
        max_word_duration,
        music_gap,
    )

    return {
        "sample_rate": sample_rate,
        "active_dbfs_threshold": active_dbfs,
        "uncovered_min_seconds": uncovered_min_seconds,
        "max_word_duration_seconds": max_word_duration,
        "music_gap_seconds": music_gap,
        "uncovered_active_audio": uncovered,
        "suspicious_segments": suspicious,
    }


def main() -> int:
    base = load_base()

    parser = argparse.ArgumentParser(description="OC-OS Local Transcription Pilot v0.4.1")
    parser.add_argument("input", type=Path)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--model", default="large-v3")
    parser.add_argument("--device", choices=["cuda", "cpu"], default="cuda")
    parser.add_argument("--compute-type", default=None)
    parser.add_argument("--language", default="ja")
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument("--music-gap", type=float, default=30.0)
    parser.add_argument("--active-dbfs", type=float, default=-35.0)
    parser.add_argument("--uncovered-min-seconds", type=float, default=2.0)
    parser.add_argument("--max-word-duration", type=float, default=3.0)
    parser.add_argument("--no-normalize", action="store_true")
    args = parser.parse_args()

    input_path = args.input.expanduser().resolve()
    if not input_path.exists():
        print(f"ERROR: input not found: {input_path}", file=sys.stderr)
        return 2

    output_dir = args.output_dir.expanduser().resolve() if args.output_dir else input_path.parent
    output_dir.mkdir(parents=True, exist_ok=True)

    compute_type = args.compute_type or ("int8_float16" if args.device == "cuda" else "int8")
    stem = input_path.stem
    audio_for_asr = input_path

    if not args.no_normalize:
        audio_for_asr = base.normalize_audio(input_path, output_dir / f"{stem}_16k_mono.wav")
    else:
        print("[1/5] 音声変換を省略します。")
        if input_path.suffix.lower() != ".wav":
            raise RuntimeError("Coverage Audit with --no-normalize requires a 16-bit mono WAV input.")

    dll_dirs = base.configure_windows_gpu_dlls()
    if dll_dirs:
        print("      GPU DLL dirs:")
        for d in dll_dirs:
            print(f"        - {d}")

    from faster_whisper import WhisperModel

    print(
        f"[2/5] version={VERSION} model={args.model} device={args.device} "
        f"compute_type={compute_type} language={args.language}"
    )
    print("      primary ASR mode=coverage-first / glossary injection=OFF")

    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)

    started = time.time()
    segments_gen, info = model.transcribe(
        str(audio_for_asr),
        language=args.language,
        task="transcribe",
        beam_size=args.beam_size,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500, speech_pad_ms=250),
        condition_on_previous_text=False,
        initial_prompt=base.MINIMAL_PROMPT,
        hotwords=None,
        word_timestamps=True,
    )

    raw_segments: list[dict] = []
    for seg in segments_gen:
        raw_segments.append({
            "id": int(seg.id),
            "start": float(seg.start),
            "end": float(seg.end),
            "text": seg.text.strip(),
            "avg_logprob": float(seg.avg_logprob) if seg.avg_logprob is not None else None,
            "no_speech_prob": float(seg.no_speech_prob) if seg.no_speech_prob is not None else None,
            "words": [
                {
                    "start": float(w.start),
                    "end": float(w.end),
                    "word": w.word,
                    "probability": float(w.probability) if w.probability is not None else None,
                }
                for w in (seg.words or [])
                if w.start is not None and w.end is not None
            ],
        })

    elapsed = time.time() - started

    print("[3/5] 人間向けCLEANを生成中...")
    clean_segments = base.build_clean_segments(raw_segments, args.music_gap)

    print("[4/5] Coverage Audit実行中...")
    audit = build_audit_v041(
        base,
        Path(audio_for_asr),
        raw_segments,
        args.active_dbfs,
        args.uncovered_min_seconds,
        args.max_word_duration,
        args.music_gap,
    )

    base_path = output_dir / stem
    clean_txt = Path(str(base_path) + "_CLEAN.txt")
    clean_srt = Path(str(base_path) + "_CLEAN.srt")
    clean_vtt = Path(str(base_path) + "_CLEAN.vtt")
    audit_txt = Path(str(base_path) + "_AUDIT.txt")
    transcript_json = Path(str(base_path) + "_TRANSCRIPT.json")

    base.write_timestamped_txt(clean_txt, clean_segments)
    base.write_srt(clean_srt, clean_segments)
    base.write_vtt(clean_vtt, clean_segments)
    base.write_audit(audit_txt, audit)

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
        "recognition": {
            "mode": "coverage-first",
            "initial_prompt": base.MINIMAL_PROMPT,
            "hotwords": None,
        },
        "artifact_contract": {
            "human_transcript": str(clean_txt),
            "audit": str(audit_txt),
            "machine_evidence": str(transcript_json),
            "raw_txt_generated": False,
        },
        "cleaning": {
            "mode": "hybrid-raw-preserving",
            "music_gap_seconds": args.music_gap,
        },
        "coverage_audit": audit,
        "raw_segments": raw_segments,
        "clean_segments": clean_segments,
    }

    transcript_json.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("[5/5] 完了")
    print(f"elapsed: {elapsed:.1f} sec")
    print(f"CLEAN: {clean_txt}")
    print(f"AUDIT: {audit_txt}")
    print(f"JSON : {transcript_json}")
    print("RAW  : not generated (machine evidence is stored inside JSON)")

    print("\n----- COVERAGE AUDIT -----")
    if not audit["uncovered_active_audio"] and not audit["suspicious_segments"]:
        print("warnings: none")
    else:
        for item in audit["uncovered_active_audio"]:
            print(
                f"UNCOVERED {base.format_clock(item['start'])} --> {base.format_clock(item['end'])} "
                f"max_rms={item['max_rms_dbfs']:.1f} dBFS"
            )
        for item in audit["suspicious_segments"]:
            print(
                f"SUSPICIOUS {base.format_clock(item['start'])} --> {base.format_clock(item['end'])} "
                f"{' / '.join(item['reasons'])}"
            )

    print("\n----- CLEAN PREVIEW -----")
    for seg in clean_segments[:40]:
        print(
            f"[{base.format_clock(seg['start'])} --> {base.format_clock(seg['end'])}] "
            f"{seg['text']}"
        )
    if len(clean_segments) > 40:
        print(f"... ({len(clean_segments) - 40} more segments)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
