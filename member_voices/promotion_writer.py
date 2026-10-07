#!/usr/bin/env python3
"""Idempotent Accepted VOICE promotion state machine.

Order:
  reserve permanent Voice_ID
  -> create/write Notion Human Index row
  -> read back and verify candidate_key + Voice_ID
  -> COMMITTED

The Notion transport is injected. This module owns the state transition and
idempotency rules, not the connector implementation.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Callable, Mapping, Any

from voice_id_allocator import reserve_voice_id, commit_voice_id


@dataclass(frozen=True)
class PromotionResult:
    candidate_key: str
    voice_id: str
    notion_page_url: str
    state: str


def ensure_promotion_journal(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS voice_promotion_journal (
            candidate_key TEXT PRIMARY KEY,
            voice_id TEXT NOT NULL UNIQUE,
            notion_page_url TEXT UNIQUE,
            write_state TEXT NOT NULL CHECK (
                write_state IN ('RESERVED','WRITE_SENT','READBACK_VERIFIED','COMMITTED')
            ),
            write_attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """)


def promote_voice(
    conn: sqlite3.Connection,
    *,
    candidate_key: str,
    voice_key: str,
    payload_factory: Callable[[str], Mapping[str, Any]],
    find_existing: Callable[[str, str], str | None],
    create_page: Callable[[Mapping[str, Any]], str],
    readback: Callable[[str], Mapping[str, Any]],
) -> PromotionResult:
    """Promote one Accepted candidate exactly once.

    find_existing(candidate_key, voice_id) must search the external Human
    Index before any create call. If a matching row already exists, the
    function verifies and commits it without creating a duplicate.
    """
    ensure_promotion_journal(conn)
    voice_id = reserve_voice_id(conn, candidate_key)

    row = conn.execute(
        """
        SELECT notion_page_url, write_state
        FROM voice_promotion_journal
        WHERE candidate_key = ?
        """,
        (candidate_key,),
    ).fetchone()

    page_url = row[0] if row and row[0] else None
    if page_url is None:
        page_url = find_existing(candidate_key, voice_id)

    if page_url is None:
        conn.execute(
            """
            INSERT INTO voice_promotion_journal
                (candidate_key, voice_id, write_state, write_attempts)
            VALUES (?, ?, 'RESERVED', 0)
            ON CONFLICT(candidate_key) DO NOTHING
            """,
            (candidate_key, voice_id),
        )
        conn.commit()

        payload = dict(payload_factory(voice_id))
        try:
            conn.execute(
                """
                UPDATE voice_promotion_journal
                SET write_state='WRITE_SENT',
                    write_attempts=write_attempts+1,
                    last_error=NULL,
                    updated_at=CURRENT_TIMESTAMP
                WHERE candidate_key=?
                """,
                (candidate_key,),
            )
            conn.commit()
            page_url = create_page(payload)
        except Exception as exc:
            conn.execute(
                """
                UPDATE voice_promotion_journal
                SET last_error=?, updated_at=CURRENT_TIMESTAMP
                WHERE candidate_key=?
                """,
                (str(exc), candidate_key),
            )
            conn.commit()
            raise

    observed = readback(page_url)
    observed_voice_id = observed.get("Voice_ID")
    observed_candidate_key = observed.get("Machine_Candidate_Key")
    if observed_voice_id != voice_id or observed_candidate_key != candidate_key:
        raise ValueError(
            "Notion readback mismatch: "
            f"Voice_ID={observed_voice_id!r}, "
            f"Machine_Candidate_Key={observed_candidate_key!r}"
        )

    conn.execute(
        """
        INSERT INTO voice_promotion_journal
            (candidate_key, voice_id, notion_page_url, write_state, write_attempts)
        VALUES (?, ?, ?, 'READBACK_VERIFIED', 0)
        ON CONFLICT(candidate_key) DO UPDATE SET
            notion_page_url=excluded.notion_page_url,
            write_state='READBACK_VERIFIED',
            last_error=NULL,
            updated_at=CURRENT_TIMESTAMP
        """,
        (candidate_key, voice_id, page_url),
    )
    conn.commit()

    commit_voice_id(conn, candidate_key, voice_key)

    conn.execute(
        """
        UPDATE voice_promotion_journal
        SET write_state='COMMITTED',
            updated_at=CURRENT_TIMESTAMP
        WHERE candidate_key=?
        """,
        (candidate_key,),
    )
    conn.commit()

    return PromotionResult(
        candidate_key=candidate_key,
        voice_id=voice_id,
        notion_page_url=page_url,
        state="COMMITTED",
    )
