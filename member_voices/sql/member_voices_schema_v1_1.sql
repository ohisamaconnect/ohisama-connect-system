-- MEMBER VOICES SQLite Schema v1.1
-- Physical implementation of the approved MEMBER VOICES logical schema.
-- IMPORTANT:
--   * source_ref_key is an INTERNAL reference key. It is NOT a permanent Source ID.
--   * voice_id is the only user-facing permanent ID slot in this layer and remains NULL
--     until an Accepted VOICE is promoted by the later allocator/write workflow.
--   * Preview/reprocessing must not consume permanent Voice IDs.

PRAGMA foreign_keys = ON;

BEGIN;

CREATE TABLE IF NOT EXISTS schema_meta (
    schema_name TEXT PRIMARY KEY,
    schema_version TEXT NOT NULL,
    contract_version TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_meta
(schema_name, schema_version, contract_version, applied_at)
VALUES
('member_voices', '1.1', '1.0', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS processing_runs (
    run_id TEXT PRIMARY KEY,
    run_type TEXT NOT NULL CHECK (
        run_type IN ('PREVIEW', 'REPROCESS', 'INCREMENTAL', 'IMPORT')
    ),
    extractor_version TEXT NOT NULL,
    source_resolver_version TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    run_status TEXT NOT NULL CHECK (
        run_status IN ('RUNNING', 'PASS', 'FAIL', 'PARTIAL', 'BLOCKED')
    ),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS source_references (
    source_ref_key TEXT PRIMARY KEY,
    source_system TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_native_id TEXT,
    source_title TEXT,
    publication TEXT,
    authors_json TEXT NOT NULL DEFAULT '[]',
    speakers_json TEXT NOT NULL DEFAULT '[]',
    published_at TEXT,
    spoken_at TEXT,
    original_url TEXT,
    archive_reference TEXT,
    text_reference TEXT,
    locator_type TEXT NOT NULL,
    native_locator_json TEXT NOT NULL,
    text_hash TEXT,
    attribution_type TEXT,
    processing_status TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (
        processing_status IN ('DISCOVERED', 'RESOLVED', 'BLOCKED', 'PROCESSED')
    ),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_source_native
ON source_references(source_system, source_native_id)
WHERE source_native_id IS NOT NULL AND source_native_id <> '';

CREATE INDEX IF NOT EXISTS ix_source_published
ON source_references(published_at);

CREATE TABLE IF NOT EXISTS source_resolution_events (
    resolution_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES processing_runs(run_id) ON DELETE CASCADE,
    source_ref_key TEXT REFERENCES source_references(source_ref_key) ON DELETE SET NULL,
    expected_speaker TEXT,
    metadata_author TEXT,
    folder_member TEXT,
    native_id_checked INTEGER NOT NULL CHECK (native_id_checked IN (0,1)),
    locator_checked INTEGER NOT NULL CHECK (locator_checked IN (0,1)),
    author_checked INTEGER NOT NULL CHECK (author_checked IN (0,1)),
    speaker_confirmed INTEGER NOT NULL CHECK (speaker_confirmed IN (0,1)),
    confirmed_speaker TEXT,
    gate_status TEXT NOT NULL CHECK (gate_status IN ('PASS', 'BLOCK')),
    block_reason TEXT CHECK (
        block_reason IS NULL OR block_reason IN (
            'SOURCE_NOT_FOUND',
            'METADATA_MISSING',
            'AUTHOR_MISSING',
            'NATIVE_LOCATOR_MISSING',
            'NATIVE_LOCATOR_MISMATCH',
            'LOCATOR_AUTHOR_CONFLICT',
            'SPEAKER_MISMATCH',
            'TEXT_REFERENCE_MISSING',
            'AMBIGUOUS_SOURCE',
            'UNSUPPORTED_SOURCE',
            'OTHER'
        )
    ),
    details_json TEXT NOT NULL DEFAULT '{}',
    resolved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_resolution_run
ON source_resolution_events(run_id);

CREATE INDEX IF NOT EXISTS ix_resolution_gate
ON source_resolution_events(gate_status, block_reason);

CREATE TABLE IF NOT EXISTS meaning_units (
    meaning_unit_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES processing_runs(run_id) ON DELETE CASCADE,
    source_ref_key TEXT NOT NULL REFERENCES source_references(source_ref_key) ON DELETE CASCADE,
    speaker TEXT NOT NULL,
    source_locator_json TEXT NOT NULL,
    central_proposition TEXT NOT NULL,
    unit_type TEXT,
    referenced_period_json TEXT,
    candidate_categories_json TEXT NOT NULL DEFAULT '[]',
    candidate_primary_topic TEXT,
    candidate_secondary_topics_json TEXT NOT NULL DEFAULT '[]',
    candidate_relations_json TEXT NOT NULL DEFAULT '[]',
    candidate_primary_anchor_json TEXT,
    knowledge_value TEXT,
    voice_eligible INTEGER NOT NULL CHECK (voice_eligible IN (0,1)),
    decision_reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_meaning_source
ON meaning_units(source_ref_key);

CREATE INDEX IF NOT EXISTS ix_meaning_speaker
ON meaning_units(speaker);

CREATE TABLE IF NOT EXISTS voice_candidates (
    candidate_key TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES processing_runs(run_id) ON DELETE CASCADE,
    source_ref_key TEXT NOT NULL REFERENCES source_references(source_ref_key) ON DELETE CASCADE,
    speaker TEXT NOT NULL,
    title TEXT,
    summary TEXT,
    published_at TEXT,
    spoken_at TEXT,
    referenced_period_json TEXT,
    temporal_perspective TEXT,
    topic_categories_json TEXT NOT NULL DEFAULT '[]',
    primary_topic TEXT,
    secondary_topics_json TEXT NOT NULL DEFAULT '[]',
    primary_anchor_json TEXT,
    related_members_json TEXT NOT NULL DEFAULT '[]',
    related_songs_json TEXT NOT NULL DEFAULT '[]',
    related_lives_json TEXT NOT NULL DEFAULT '[]',
    related_events_json TEXT NOT NULL DEFAULT '[]',
    related_releases_json TEXT NOT NULL DEFAULT '[]',
    knowledge_value TEXT,
    attribution TEXT,
    candidate_decision TEXT NOT NULL CHECK (
        candidate_decision IN ('ACCEPT', 'REJECT', 'REVIEW')
    ),
    decision_reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_candidate_source
ON voice_candidates(source_ref_key);

CREATE INDEX IF NOT EXISTS ix_candidate_speaker
ON voice_candidates(speaker);

CREATE TABLE IF NOT EXISTS voice_candidate_meaning_units (
    candidate_key TEXT NOT NULL REFERENCES voice_candidates(candidate_key) ON DELETE CASCADE,
    meaning_unit_id TEXT NOT NULL REFERENCES meaning_units(meaning_unit_id) ON DELETE CASCADE,
    unit_order INTEGER NOT NULL,
    PRIMARY KEY (candidate_key, meaning_unit_id)
);

CREATE TABLE IF NOT EXISTS voices (
    voice_key TEXT PRIMARY KEY,
    voice_id TEXT UNIQUE,
    source_ref_key TEXT NOT NULL REFERENCES source_references(source_ref_key) ON DELETE RESTRICT,
    originating_candidate_key TEXT UNIQUE REFERENCES voice_candidates(candidate_key) ON DELETE SET NULL,
    title TEXT NOT NULL,
    speaker TEXT NOT NULL,
    summary TEXT NOT NULL,
    source_locator_json TEXT NOT NULL,
    published_at TEXT,
    spoken_at TEXT,
    referenced_period_json TEXT,
    temporal_perspective TEXT,
    topic_categories_json TEXT NOT NULL DEFAULT '[]',
    primary_topic TEXT,
    secondary_topics_json TEXT NOT NULL DEFAULT '[]',
    primary_anchor_json TEXT,
    related_members_json TEXT NOT NULL DEFAULT '[]',
    related_songs_json TEXT NOT NULL DEFAULT '[]',
    related_lives_json TEXT NOT NULL DEFAULT '[]',
    related_events_json TEXT NOT NULL DEFAULT '[]',
    related_releases_json TEXT NOT NULL DEFAULT '[]',
    knowledge_value TEXT,
    attribution TEXT,
    status TEXT NOT NULL DEFAULT 'AUTO INDEXED' CHECK (
        status IN ('AUTO INDEXED', 'SOURCE CHECKED', 'PINNED')
    ),
    accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_voice_speaker
ON voices(speaker);

CREATE INDEX IF NOT EXISTS ix_voice_source
ON voices(source_ref_key);

CREATE TABLE IF NOT EXISTS voice_meaning_units (
    voice_key TEXT NOT NULL REFERENCES voices(voice_key) ON DELETE CASCADE,
    meaning_unit_id TEXT NOT NULL REFERENCES meaning_units(meaning_unit_id) ON DELETE RESTRICT,
    unit_order INTEGER NOT NULL,
    PRIMARY KEY (voice_key, meaning_unit_id)
);

CREATE TABLE IF NOT EXISTS provisional_anchors (
    provisional_anchor_key TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES processing_runs(run_id) ON DELETE CASCADE,
    candidate_key TEXT REFERENCES voice_candidates(candidate_key) ON DELETE CASCADE,
    speaker TEXT NOT NULL,
    object_type TEXT,
    label TEXT NOT NULL,
    evidence_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'PROVISIONAL' CHECK (
        status IN ('PROVISIONAL', 'RESOLVED', 'REJECTED')
    ),
    resolved_hha_object_type TEXT,
    resolved_hha_object_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS thread_candidates (
    thread_key TEXT PRIMARY KEY,
    thread_type TEXT NOT NULL CHECK (thread_type IN ('ANCHOR', 'THEME')),
    natural_key TEXT NOT NULL UNIQUE,
    speaker TEXT NOT NULL,
    anchor_object_system TEXT,
    anchor_object_type TEXT,
    anchor_object_id TEXT,
    anchor_object_label TEXT,
    normalized_primary_topic TEXT,
    formal_thread_ready INTEGER NOT NULL DEFAULT 0 CHECK (formal_thread_ready IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (thread_type = 'ANCHOR' AND anchor_object_id IS NOT NULL AND normalized_primary_topic IS NULL)
        OR
        (thread_type = 'THEME' AND normalized_primary_topic IS NOT NULL AND anchor_object_id IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS candidate_thread_memberships (
    candidate_key TEXT NOT NULL REFERENCES voice_candidates(candidate_key) ON DELETE CASCADE,
    thread_key TEXT NOT NULL REFERENCES thread_candidates(thread_key) ON DELETE CASCADE,
    membership_reason TEXT NOT NULL,
    PRIMARY KEY (candidate_key, thread_key)
);

CREATE TABLE IF NOT EXISTS voice_thread_memberships (
    voice_key TEXT NOT NULL REFERENCES voices(voice_key) ON DELETE CASCADE,
    thread_key TEXT NOT NULL REFERENCES thread_candidates(thread_key) ON DELETE CASCADE,
    membership_reason TEXT NOT NULL,
    PRIMARY KEY (voice_key, thread_key)
);

CREATE TABLE IF NOT EXISTS comparison_candidates (
    comparison_candidate_key TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES processing_runs(run_id) ON DELETE CASCADE,
    thread_key TEXT REFERENCES thread_candidates(thread_key) ON DELETE SET NULL,
    prior_candidate_key TEXT NOT NULL REFERENCES voice_candidates(candidate_key) ON DELETE CASCADE,
    current_candidate_key TEXT NOT NULL REFERENCES voice_candidates(candidate_key) ON DELETE CASCADE,
    relation_to_prior TEXT NOT NULL CHECK (
        relation_to_prior IN (
            'DUPLICATE',
            'CONSISTENT',
            'ELABORATION',
            'REFRAMING',
            'EXPLICIT_CHANGE',
            'TENSION',
            'UNCLEAR'
        )
    ),
    difference_summary TEXT NOT NULL,
    explicit_change_claimed INTEGER NOT NULL CHECK (explicit_change_claimed IN (0,1)),
    comparison_confidence TEXT NOT NULL,
    evidence_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (prior_candidate_key <> current_candidate_key),
    CHECK (
        relation_to_prior <> 'EXPLICIT_CHANGE' OR explicit_change_claimed = 1
    )
);

CREATE TABLE IF NOT EXISTS comparison_records (
    comparison_key TEXT PRIMARY KEY,
    thread_key TEXT REFERENCES thread_candidates(thread_key) ON DELETE SET NULL,
    prior_voice_key TEXT NOT NULL REFERENCES voices(voice_key) ON DELETE CASCADE,
    current_voice_key TEXT NOT NULL REFERENCES voices(voice_key) ON DELETE CASCADE,
    relation_to_prior TEXT NOT NULL CHECK (
        relation_to_prior IN (
            'DUPLICATE',
            'CONSISTENT',
            'ELABORATION',
            'REFRAMING',
            'EXPLICIT_CHANGE',
            'TENSION',
            'UNCLEAR'
        )
    ),
    difference_summary TEXT NOT NULL,
    explicit_change_claimed INTEGER NOT NULL CHECK (explicit_change_claimed IN (0,1)),
    comparison_confidence TEXT NOT NULL,
    evidence_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (prior_voice_key <> current_voice_key),
    CHECK (
        relation_to_prior <> 'EXPLICIT_CHANGE' OR explicit_change_claimed = 1
    ),
    UNIQUE (prior_voice_key, current_voice_key, thread_key)
);

CREATE TABLE IF NOT EXISTS processing_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT REFERENCES processing_runs(run_id) ON DELETE CASCADE,
    source_ref_key TEXT REFERENCES source_references(source_ref_key) ON DELETE SET NULL,
    stage TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR', 'BLOCK')),
    code TEXT,
    message TEXT NOT NULL,
    payload_json TEXT,
    logged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_log_run_stage
ON processing_logs(run_id, stage);

COMMIT;
