# MEMBER VOICES｜Voice_ID Allocator Contract v1.0

Status: **APPROVED FOR SMALL WRITE PILOT**  
Effective: 2026-10-08 JST  
Logical schema basis: MEMBER VOICES Schema v1.1 / Extraction & Thread Contract v1.0

## 1. Permanent ID format

Accepted VOICE permanent IDs use:

```text
VOC-000001
VOC-000002
...
```

Rules:

- Prefix: `VOC-`
- Numeric width: 6 digits, zero-padded
- First permanent ID: `VOC-000001`
- Numeric sequence is monotonically increasing.
- Once allocated, a Voice_ID never changes.
- An allocated Voice_ID is never reassigned to another VOICE.
- Gaps are allowed and must not be compacted.

This ID belongs to MEMBER VOICES only. It is not an HHA Canonical object ID and not a Source ID.

## 2. Allocation boundary

Permanent IDs are allocated only when an Accepted VOICE is being promoted to the Human Knowledge Index.

These stages do **not** allocate a permanent Voice_ID:

- source discovery
- Source Resolver
- Meaning Unit extraction
- VOICE Candidate extraction
- REJECT / REVIEW candidate creation
- Preview
- dry run
- schema validation
- comparison-only processing

## 3. Idempotency key

The allocator binds one permanent Voice_ID to one machine `candidate_key`.

Invariant:

```text
candidate_key <-> Voice_ID
```

Both sides are unique.

A retry for the same `candidate_key` must return the already allocated Voice_ID.

A retry must never consume a second permanent Voice_ID.

## 4. Reservation and commit behavior

Allocation is persisted before the external Notion write.

States:

- `RESERVED`: ID allocated to the Accepted candidate, Notion write not yet confirmed.
- `COMMITTED`: Notion row written and read-back verified.
- `ABANDONED`: promotion was intentionally cancelled after reservation.

Rules:

1. Reserve the next ID in a SQLite transaction.
2. Persist the binding to `candidate_key`.
3. Attempt the Notion write.
4. Read the Notion row back.
5. Only after successful read-back set the allocation to `COMMITTED`.

If the Notion write fails or its result is unknown:

- keep the allocation as `RESERVED`;
- do not assign that ID to another candidate;
- retry the same candidate with the same Voice_ID;
- verify Notion first before sending a duplicate create request when the prior result is unknown.

If the candidate is deliberately withdrawn after reservation:

- mark `ABANDONED`;
- never reuse the ID;
- the gap is an audit trail, not an error.

## 5. Next-number rule

The next number is:

```text
MAX(allocated numeric component) + 1
```

When no allocation exists, start at 1.

Do not derive the next number from Notion row count.

Do not derive it from sort order.

Do not backfill holes.

## 6. Concurrency rule

Allocation must occur inside a SQLite write transaction.

Only one transaction may calculate and reserve the next ID at a time.

Recommended flow:

```text
BEGIN IMMEDIATE
  -> find existing allocation for candidate_key
  -> if found: return existing ID
  -> else: calculate MAX(sequence_no) + 1
  -> insert RESERVED allocation
COMMIT
```

The unique constraints on `candidate_key`, `voice_id`, and `sequence_no` are the final guard.

## 7. Machine / Notion join

The Human Index row keeps:

- Voice_ID
- Machine_Candidate_Key

The Machine Processing Layer keeps:

- Voice_ID
- candidate_key
- voice_key
- allocation status

This makes Notion read-back reversible to the machine record.

## 8. Small Write Pilot allocation

The small write Pilot may allocate IDs only for the VOICE rows actually selected for write.

Current Pilot ceiling: **5 Accepted VOICE rows**.

The zero-VOICE source does not allocate an ID.

The blocked speaker-mismatch source does not allocate an ID.

## 9. Bulk authorization

This contract does not authorize bulk allocation or bulk Notion import.

Bulk processing requires a later Approval Gate after small write Pilot read-back verification.
