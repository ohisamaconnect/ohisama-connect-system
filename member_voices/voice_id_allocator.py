#!/usr/bin/env python3
"""Durable permanent Voice_ID allocator for MEMBER VOICES.

Contract:
- Format: VOC-000001 (VOC- + six digits)
- Preview/dry-run never calls this allocator.
- One candidate_key has at most one permanent Voice_ID.
- Retry returns the existing allocation.
- A reserved/abandoned ID is never reused for another candidate.
"""

from __future__ import annotations

import sqlite3
from typing import Optional


PREFIX = "VOC-"
MAX_SEQUENCE = 999_999


def format_voice_id(sequence_no: int) -> str:
    if not 1 <= sequence_no <= MAX_SEQUENCE:
        raise ValueError(f"sequence_no out of range: {sequence_no}")
    return f"{PREFIX}{sequence_no:06d}"


def get_allocation(conn: sqlite3.Connection, candidate_key: str) -> Optional[sqlite3.Row]:
    old_factory = conn.row_factory
    try:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            """
            SELECT sequence_no, voice_id, candidate_key, voice_key,
                   allocation_status, reserved_at, committed_at, abandoned_at
            FROM voice_id_allocations
            WHERE candidate_key = ?
            """,
            (candidate_key,),
        ).fetchone()
    finally:
        conn.row_factory = old_factory


def reserve_voice_id(conn: sqlite3.Connection, candidate_key: str) -> str:
    """Reserve or return the durable Voice_ID for one Accepted candidate.

    The caller must only invoke this at the Accepted VOICE promotion boundary.
    The candidate must already exist in voice_candidates.
    """
    if not candidate_key:
        raise ValueError("candidate_key is required")

    conn.execute("BEGIN IMMEDIATE")
    try:
        existing = conn.execute(
            "SELECT voice_id FROM voice_id_allocations WHERE candidate_key = ?",
            (candidate_key,),
        ).fetchone()
        if existing:
            conn.commit()
            return existing[0]

        row = conn.execute(
            "SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM voice_id_allocations"
        ).fetchone()
        sequence_no = int(row[0])
        if sequence_no > MAX_SEQUENCE:
            raise RuntimeError("Voice_ID sequence exhausted")

        voice_id = format_voice_id(sequence_no)
        conn.execute(
            """
            INSERT INTO voice_id_allocations
                (sequence_no, voice_id, candidate_key, allocation_status)
            VALUES (?, ?, ?, 'RESERVED')
            """,
            (sequence_no, voice_id, candidate_key),
        )
        conn.commit()
        return voice_id
    except Exception:
        conn.rollback()
        raise


def commit_voice_id(
    conn: sqlite3.Connection,
    candidate_key: str,
    voice_key: str,
) -> str:
    """Mark a reservation COMMITTED after Notion write + read-back verification."""
    if not candidate_key or not voice_key:
        raise ValueError("candidate_key and voice_key are required")

    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute(
            """
            SELECT voice_id, allocation_status, voice_key
            FROM voice_id_allocations
            WHERE candidate_key = ?
            """,
            (candidate_key,),
        ).fetchone()
        if row is None:
            raise KeyError(f"no Voice_ID reservation for {candidate_key}")

        voice_id, status, existing_voice_key = row
        if status == "ABANDONED":
            raise ValueError(f"allocation is ABANDONED: {candidate_key}")
        if status == "COMMITTED":
            if existing_voice_key != voice_key:
                raise ValueError(
                    f"committed allocation points to different voice_key: {existing_voice_key}"
                )
            conn.commit()
            return voice_id

        conn.execute(
            """
            UPDATE voice_id_allocations
            SET allocation_status = 'COMMITTED',
                voice_key = ?,
                committed_at = CURRENT_TIMESTAMP,
                abandoned_at = NULL
            WHERE candidate_key = ?
            """,
            (voice_key, candidate_key),
        )
        conn.commit()
        return voice_id
    except Exception:
        conn.rollback()
        raise


def abandon_voice_id(conn: sqlite3.Connection, candidate_key: str) -> str:
    """Mark a RESERVED allocation ABANDONED without making the ID reusable."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute(
            """
            SELECT voice_id, allocation_status
            FROM voice_id_allocations
            WHERE candidate_key = ?
            """,
            (candidate_key,),
        ).fetchone()
        if row is None:
            raise KeyError(f"no Voice_ID reservation for {candidate_key}")

        voice_id, status = row
        if status == "COMMITTED":
            raise ValueError(f"cannot abandon COMMITTED allocation: {candidate_key}")
        if status == "ABANDONED":
            conn.commit()
            return voice_id

        conn.execute(
            """
            UPDATE voice_id_allocations
            SET allocation_status = 'ABANDONED',
                committed_at = NULL,
                abandoned_at = CURRENT_TIMESTAMP
            WHERE candidate_key = ?
            """,
            (candidate_key,),
        )
        conn.commit()
        return voice_id
    except Exception:
        conn.rollback()
        raise
