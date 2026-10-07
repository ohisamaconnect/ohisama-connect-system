# MEMBER VOICES｜Small Reprocessing Preview Report

Date: 2026-10-08  
Run ID: `preview-20261008-01`  
Phase: IMPLEMENTATION / Small Reprocessing Preview  
Canonical basis:
- MEMBER VOICES｜Implementation Handover / Restart v1.0
- MEMBER VOICES｜Schema v1.1 & Extraction / Thread Contract v1.0

## Result

**PASS**

This Preview does not rerun or reopen the approved 60-article Pilot.
It verifies the implementation path defined at the Exact Restart Point.

No permanent Voice_ID was allocated.
No Notion write was performed.

## Implemented before Preview

1. SQLite Schema v1.1
2. Extraction JSON Schema v1.1
3. Extraction JSON Contract v1.0
4. Source Resolver Safety Gate v1.0
5. deterministic internal machine keys
6. validation harness

## Validation performed

### SQLite Schema v1.1

Executed against an in-memory SQLite database.

Result:
- DDL execution: PASS
- expected tables: 16 / 16
- `schema_meta.schema_version`: `1.1`
- `schema_meta.contract_version`: `1.0`

### Source Resolver Safety Gate

Validated:
- member-name whitespace normalization: PASS
- Author / expected Speaker match: PASS
- wrong expected Speaker: BLOCK
- Archive member-folder / metadata Author conflict: BLOCK
- body-text member mentions are not used to override Speaker attribution

During implementation read-back, an escaping defect in the first whitespace-normalization regex was found and corrected before final Preview acceptance.

Corrected commit:
- `949b5720354b94eceaa2e40371a0e8edb78902ec`

### Preview artifact read-back

All six committed Preview JSON artifacts were read back from GitHub.

Checks:
- JSON parse
- schema / contract version
- internal key format
- deterministic `source_ref_key`
- Native Locator presence
- source returnability
- PASS/BLOCK Gate invariants
- Meaning Unit -> VOICE Candidate references
- Thread candidate shape
- Comparison relation constraints
- EXPLICIT_CHANGE safety condition

Result: **6 / 6 PASS**

## Preview cases

| Source | Gate | Meaning Units | VOICE Candidates | Threads | Comparisons | Purpose |
|---|---:|---:|---:|---:|---:|---|
| 松田好花 / 26676 | PASS | 1 | 0 | 0 | 0 | valid zero-VOICE behavior |
| 小坂菜緒 / 25481 | PASS | 2 | 1 | 0 | 0 | same experience-flow merged rather than over-fragmented |
| 小坂菜緒 / 35133 | PASS | 3 | 2 | 1 THEME | 1 | temporal split + explicit comparison |
| 大田美月 / 65922 | PASS | 2 | 2 | 1 THEME | 0 | values + expression goal + provisional anchor handling |
| 大田美月 / 67706 | PASS | 2 | 2 | 1 ANCHOR | 0 | Canonical HHA SONG anchor |
| ポカ / 71234 requested as 小坂菜緒 | BLOCK | 0 | 0 | 0 | 0 | Speaker misattribution safety test |

## Key implementation findings

### 1. Zero VOICE remains valid

Article 26676 produces a Meaning Unit but no VOICE Candidate.
The implementation does not force one article into one VOICE.

### 2. Meaning Unit and VOICE granularity remain separate

Article 25481 has two Meaning Units that belong to one central audition experience-flow.
They are merged into one VOICE Candidate rather than mechanically split.

### 3. Temporal comparison works without collapsing viewpoints

Article 35133 retains:
- the retrospective center-period pressure
- the current relief / release from that role and future orientation

as separate VOICE Candidates.

They are joined by the concrete Theme:

`THEME:小坂菜緒:センターという役割に対する自己認識`

The comparison is `EXPLICIT_CHANGE` because the source itself explicitly marks the changed position and feeling.

### 4. Provisional Anchor does not mint an HHA ID

Article 65922 refers centrally to the 2025 新参者 context.
Because this Preview does not resolve a permanent HHA object ID for it, the anchor stays `PROVISIONAL`.

No fake HHA key is created.

### 5. Canonical Anchor can resolve to HHA

Article 67706 centers one VOICE on `月と星が踊るMidnight`.

The HHA SONG object verified for this Preview is:
- Song_ID: 90
- MEMBER VOICES reference: `SNG-090`
- Title: `月と星が踊るMidnight`

The resulting Anchor Thread candidate is:

`ANCHOR:大田美月:SNG-090`

It remains a first-member Thread candidate and therefore `formal_thread_ready=false`.

### 6. Safety Gate stops wrong-Speaker extraction

Article 71234 metadata Author is `ポカ`.

When the candidate is presented as if its Speaker were `小坂 菜緒`, the resolver returns:

- `gate_status = BLOCK`
- `block_reason = SPEAKER_MISMATCH`

and all semantic extraction arrays remain empty.

This closes the misattribution path observed during the approved Pilot.

## Files

- `member_voices/sql/member_voices_schema_v1_1.sql`
- `member_voices/schemas/member_voices_extraction_v1_1.schema.json`
- `member_voices/docs/MEMBER_VOICES_EXTRACTION_JSON_CONTRACT_v1.0.md`
- `member_voices/source_resolver.py`
- `member_voices/tests/validate_member_voices_impl.py`
- `member_voices/preview/2026-10-08/*.json`
- `.github/workflows/member-voices-validation.yml`

## Gate decision

**SQLite Schema v1.1 → Extraction JSON Contract → Source Resolver Safety Gate → Small Reprocessing Preview is complete and passes.**

The Exact Restart Point may now advance to:

```text
Notion Human Index Schema Preview
  ->
very small Accepted VOICE write Pilot
  ->
read-back verification
```

This report does **not** authorize large-scale processing or large Notion writes.
