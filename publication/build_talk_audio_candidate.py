#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OC-OS Public Talk Audio Candidate Builder
v0.1.0-preview (2026-09-26)

Build a human-QC candidate talk-only WAV from:
- UVR SPEECH_STEM WAV (MASTER timeline preserved)
- OC-OS *_TRANSCRIPT.json

Important:
- This does NOT select individual ASR sentences.
- It removes only very long gaps between valid ASR words.
- Everything between long gaps is preserved, including short ASR misses.
- Output is a QC candidate, never an automatically publishable master.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import wave
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable

VERSION = "0.1.0-preview"


@dataclass
class Interval:
    start: float
    end: float

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


def clamp(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def load_transcript(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict):
        raise ValueError("TRANSCRIPT.json root must be an object")
    if not isinstance(data.get("raw_segments"), list):
        raise ValueError("TRANSCRIPT.json raw_segments is missing")
    return data


def iter_valid_words(raw_segments: list[dict], max_word_duration: float) -> Iterable[Interval]:
    for seg in raw_segments:
        words = seg.get("words") or []
        if not isinstance(words, list):
            continue
        for word in words:
            try:
                start = float(word["start"])
                end = float(word["end"])
            except (KeyError, TypeError, ValueError):
                continue
            duration = end - start
            if start < 0 or end <= start:
                continue
            if duration > max_word_duration:
                continue
            yield Interval(start, end)


def merge_word_intervals(words: list[Interval]) -> list[Interval]:
    if not words:
        return []
    words = sorted(words, key=lambda x: (x.start, x.end))
    merged: list[Interval] = [Interval(words[0].start, words[0].end)]
    for item in words[1:]:
        last = merged[-1]
        if item.start <= last.end:
            last.end = max(last.end, item.end)
        else:
            merged.append(Interval(item.start, item.end))
    return merged


def long_gaps(words: list[Interval], music_gap: float) -> list[Interval]:
    if len(words) < 2:
        return []
    gaps: list[Interval] = []
    for left, right in zip(words, words[1:]):
        gap_start = left.end
        gap_end = right.start
        if gap_end - gap_start >= music_gap:
            gaps.append(Interval(gap_start, gap_end))
    return gaps


def build_cut_intervals(
    gaps: list[Interval],
    duration: float,
    edge_pad: float,
) -> list[Interval]:
    cuts: list[Interval] = []
    for gap in gaps:
        start = clamp(gap.start + edge_pad, 0.0, duration)
        end = clamp(gap.end - edge_pad, 0.0, duration)
        if end > start:
            cuts.append(Interval(start, end))
    return cuts


def invert_intervals(cuts: list[Interval], duration: float) -> list[Interval]:
    if duration <= 0:
        return []
    if not cuts:
        return [Interval(0.0, duration)]

    cuts = sorted(cuts, key=lambda x: (x.start, x.end))
    merged: list[Interval] = []
    for cut in cuts:
        if not merged or cut.start > merged[-1].end:
            merged.append(Interval(cut.start, cut.end))
        else:
            merged[-1].end = max(merged[-1].end, cut.end)

    keep: list[Interval] = []
    cursor = 0.0
    for cut in merged:
        if cut.start > cursor:
            keep.append(Interval(cursor, cut.start))
        cursor = max(cursor, cut.end)
    if cursor < duration:
        keep.append(Interval(cursor, duration))
    return keep


def read_wav_info(path: Path) -> dict:
    with wave.open(str(path), "rb") as wf:
        if wf.getcomptype() != "NONE":
            raise ValueError("Compressed WAV is not supported")
        frames = wf.getnframes()
        rate = wf.getframerate()
        return {
            "channels": wf.getnchannels(),
            "sample_width": wf.getsampwidth(),
            "frame_rate": rate,
            "frames": frames,
            "duration": frames / rate if rate else 0.0,
        }


def seconds_to_frame(seconds: float, frame_rate: int, total_frames: int) -> int:
    return max(0, min(total_frames, int(round(seconds * frame_rate))))


def silence_frames(frame_count: int, channels: int, sample_width: int) -> bytes:
    if frame_count <= 0:
        return b""
    # PCM WAV from UVR is expected to be signed PCM for widths > 1.
    # 8-bit PCM is unsigned and uses 0x80 as digital silence.
    if sample_width == 1:
        frame = bytes([128]) * channels
    else:
        frame = bytes(sample_width * channels)
    return frame * frame_count


def write_candidate_wav(
    source: Path,
    output: Path,
    keep: list[Interval],
    join_silence_seconds: float,
) -> dict:
    with wave.open(str(source), "rb") as src:
        channels = src.getnchannels()
        sample_width = src.getsampwidth()
        frame_rate = src.getframerate()
        total_frames = src.getnframes()
        comptype = src.getcomptype()
        compname = src.getcompname()

        if comptype != "NONE":
            raise ValueError("Compressed WAV is not supported")

        output.parent.mkdir(parents=True, exist_ok=True)
        written_frames = 0
        join_frames = seconds_to_frame(join_silence_seconds, frame_rate, 10**18)

        with wave.open(str(output), "wb") as dst:
            dst.setnchannels(channels)
            dst.setsampwidth(sample_width)
            dst.setframerate(frame_rate)
            dst.setcomptype(comptype, compname)

            for idx, interval in enumerate(keep):
                start_frame = seconds_to_frame(interval.start, frame_rate, total_frames)
                end_frame = seconds_to_frame(interval.end, frame_rate, total_frames)
                frame_count = max(0, end_frame - start_frame)
                if frame_count <= 0:
                    continue

                src.setpos(start_frame)
                remaining = frame_count
                chunk_size = 262144
                while remaining > 0:
                    n = min(remaining, chunk_size)
                    data = src.readframes(n)
                    if not data:
                        break
                    dst.writeframesraw(data)
                    actual_frames = len(data) // (channels * sample_width)
                    written_frames += actual_frames
                    remaining -= actual_frames

                if idx < len(keep) - 1 and join_frames > 0:
                    silence = silence_frames(join_frames, channels, sample_width)
                    dst.writeframesraw(silence)
                    written_frames += join_frames

            dst.writeframes(b"")

    return {
        "frames": written_frames,
        "duration": written_frames / frame_rate if frame_rate else 0.0,
        "channels": channels,
        "sample_width": sample_width,
        "frame_rate": frame_rate,
    }


def interval_dicts(items: list[Interval]) -> list[dict]:
    return [
        {
            "start": round(x.start, 3),
            "end": round(x.end, 3),
            "duration": round(x.duration, 3),
        }
        for x in items
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="OC-OS Public Talk Audio Candidate Builder")
    parser.add_argument("speech_stem", type=Path)
    parser.add_argument("transcript_json", type=Path)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--music-gap", type=float, default=None)
    parser.add_argument("--edge-pad", type=float, default=1.0)
    parser.add_argument("--join-silence", type=float, default=0.25)
    parser.add_argument("--max-word-duration", type=float, default=3.0)
    parser.add_argument("--duration-tolerance", type=float, default=1.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    speech_stem = args.speech_stem.expanduser().resolve()
    transcript_path = args.transcript_json.expanduser().resolve()
    if not speech_stem.exists():
        print(f"ERROR: speech stem not found: {speech_stem}", file=sys.stderr)
        return 2
    if not transcript_path.exists():
        print(f"ERROR: transcript JSON not found: {transcript_path}", file=sys.stderr)
        return 2

    transcript = load_transcript(transcript_path)
    wav_info = read_wav_info(speech_stem)
    source_duration = float(wav_info["duration"])
    transcript_duration = transcript.get("duration")
    transcript_duration = float(transcript_duration) if transcript_duration is not None else None

    warnings: list[str] = []
    if transcript_duration is not None:
        delta = abs(source_duration - transcript_duration)
        if delta > args.duration_tolerance:
            warnings.append(
                f"source/transcript duration mismatch: source={source_duration:.3f}s "
                f"transcript={transcript_duration:.3f}s delta={delta:.3f}s"
            )

    configured_music_gap = (
        transcript.get("cleaning", {}).get("music_gap_seconds")
        if isinstance(transcript.get("cleaning"), dict)
        else None
    )
    music_gap = float(args.music_gap if args.music_gap is not None else (configured_music_gap or 30.0))

    words = merge_word_intervals(
        list(iter_valid_words(transcript["raw_segments"], args.max_word_duration))
    )
    if not words:
        print("ERROR: no valid word timestamps found", file=sys.stderr)
        return 3

    gaps = long_gaps(words, music_gap)
    cuts = build_cut_intervals(gaps, source_duration, args.edge_pad)
    keep = invert_intervals(cuts, source_duration)

    output_dir = args.output_dir.expanduser().resolve() if args.output_dir else speech_stem.parent
    stem = speech_stem.stem
    output_wav = output_dir / f"{stem}_TALK_CANDIDATE.wav"
    manifest_path = output_dir / f"{stem}_TALK_EDIT.json"

    output_info = None
    if not args.dry_run:
        output_info = write_candidate_wav(
            speech_stem,
            output_wav,
            keep,
            max(0.0, args.join_silence),
        )

    manifest = {
        "pipeline": "OC-OS Public Talk Audio Candidate Builder",
        "version": VERSION,
        "source_speech_stem": str(speech_stem),
        "source_transcript_json": str(transcript_path),
        "source_transcript_pipeline_version": transcript.get("version"),
        "source_audio": wav_info,
        "transcript_duration": transcript_duration,
        "parameters": {
            "music_gap_seconds": music_gap,
            "edge_pad_seconds": args.edge_pad,
            "join_silence_seconds": args.join_silence,
            "max_word_duration_seconds": args.max_word_duration,
            "duration_tolerance_seconds": args.duration_tolerance,
        },
        "word_interval_count": len(words),
        "detected_long_gaps": interval_dicts(gaps),
        "cut_intervals": interval_dicts(cuts),
        "keep_intervals": interval_dicts(keep),
        "output_wav": str(output_wav) if not args.dry_run else None,
        "output_audio": output_info,
        "warnings": warnings,
        "human_qc_required": True,
        "publication_approved": False,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("========================================")
    print("OC-OS PUBLIC TALK AUDIO CANDIDATE")
    print(f"VERSION = {VERSION}")
    print(f"DRY RUN = {args.dry_run}")
    print("========================================")
    print(f"source duration : {source_duration:.2f}s")
    print(f"long gaps      : {len(gaps)}")
    print(f"cut intervals  : {len(cuts)}")
    print(f"keep intervals : {len(keep)}")
    print(f"manifest       : {manifest_path}")
    if not args.dry_run:
        print(f"candidate WAV  : {output_wav}")
        print(f"output duration: {output_info['duration']:.2f}s")
    if warnings:
        print("warnings:")
        for warning in warnings:
            print(f"- {warning}")
    print("Human QC is required before any publication use.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
