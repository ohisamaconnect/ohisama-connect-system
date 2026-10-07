# MEMBER VOICES Extraction JSON Contract v1.0

Status: IMPLEMENTATION CONTRACT  
Logical basis: MEMBER VOICES Schema v1.1 & Extraction / Thread Contract v1.0  
Machine artifact schema: `member_voices/schemas/member_voices_extraction_v1_1.schema.json`

## 1. Purpose

This contract converts already-approved MEMBER VOICES extraction rules into a machine-output contract.

It does **not** redesign the logical schema and it does **not** rerun the 60-article Pilot.

The extractor may propose knowledge units. It may not decide human importance, may not invent facts, and may not bypass the Source Resolver Safety Gate.

## 2. Required processing order

Every source must pass through this order.

```text
Candidate Source
  -> source metadata / Author verification
  -> Native Locator verification
  -> Speaker confirmation
  -> Meaning Unit extraction
  -> VOICE Candidate extraction
  -> Anchor / Theme candidate assignment
  -> Comparison candidate generation
```

If Source Resolver returns `BLOCK`, processing stops before Meaning Unit extraction.

For a blocked source the output arrays below MUST all be empty:

- `meaning_units`
- `voice_candidates`
- `thread_candidates`
- `comparison_candidates`

Search ranking, member-name occurrence in the body, related-member mentions, query terms, or a previous conversation context never prove Speaker identity.

## 3. Source identity boundary

The Personal Blog Archive owns Blog source identity.

MEMBER VOICES must not create a second permanent Source ID.

Before the Archive introduces its own permanent Blog ID, use the Archive Native Locator as the source identity basis:

- Article_ID
- Author
- Published_At
- Local_Dir
- Original_URL
- source hash when available

`source_ref_key` in MEMBER VOICES is only an internal deterministic join key. It is not a canonical source identifier and must never be exposed as if it were one.

## 4. Internal key strategy

The implementation uses machine keys only for joins and idempotent reprocessing.

### source_ref_key

```text
src_<24 hex>
```

Derived from a canonical JSON payload containing source system and Native Locator identity fields.

### meaning_unit_id

```text
mu_<24 hex>
```

Derived from source_ref_key, extractor version, source locator, and the unit's central proposition.

Meaning Unit ID is a processing key, not a permanent human-facing ID.

### candidate_key

```text
vc_<24 hex>
```

Derived from source_ref_key plus the ordered Meaning Unit references and candidate proposition.

### voice_key / Voice_ID

The SQLite `voice_key` is an internal row key.

`voice_id` is the only slot reserved for a future permanent MEMBER VOICES ID.

Preview and reprocessing runs MUST NOT allocate or consume permanent Voice_ID values.

### thread_key

Thread machine keys are deterministic:

```text
thr_a_<24 hex>   # ANCHOR
thr_t_<24 hex>   # THEME
```

Each also stores the contract-facing natural key.

ANCHOR:

```text
ANCHOR:<Speaker>:<Canonical Object>
```

THEME:

```text
THEME:<Speaker>:<Normalized Primary Topic>
```

A first VOICE may retain a candidate Thread key. A formal Thread display is not required until a second VOICE makes the connection meaningful.

### comparison_candidate_key

```text
cmp_<24 hex>
```

Derived from directional prior/current candidate keys plus thread key.

## 5. Meaning Unit rules

Meaning Unit is a machine analysis unit, not the human knowledge unit.

Do not mechanically map one sentence or one paragraph to one Meaning Unit.

A Meaning Unit should represent one coherent proposition or experience-flow that can be evaluated for knowledge value.

Several adjacent sentences or paragraphs may form one Meaning Unit when they share the same central proposition.

Split when the subject, event, time, relationship, or proposition materially changes.

Every Meaning Unit must include:

- a returnable source locator
- the confirmed Speaker
- central proposition
- candidate metadata
- `voice_eligible`
- a concrete `decision_reason`

## 6. VOICE eligibility

Zero VOICE from one source is normal and valid.

Do not force one article to produce one VOICE.

A candidate is eligible only when it has durable value for understanding the member over time, such as:

- a specific self-understanding
- a concrete relationship
- a group or role interpretation
- a meaningful experience and its interpretation
- a clearly expressed intention or future orientation
- a later-comparable reflection
- a background experience that materially explains the member

The following alone are not sufficient:

- routine announcements
- schedules
- generic thanks
- photo captions
- generic `頑張る` / `頑張りたい`
- a mere mention of another member, song, live, release, or event

Announcement content may still contain a VOICE if the member gives a specific interpretation, intention, or self-positioning. Extract that interpretation, not the announcement itself.

## 7. Granularity

The human knowledge unit is VOICE.

Do not over-fragment one experience into many tiny VOICE records.

Several Meaning Units may be merged into one VOICE Candidate when they form one central proposition or experience-flow.

Split VOICE Candidates when target, event, time, relationship, or conclusion materially changes.

## 8. Attribution and Summary

Never mix the Speaker's own statement with third-party explanation.

`Summary` is not a free paraphrase.

It must preserve attribution and make clear who said, felt, interpreted, or intended what.

Do not turn inference into speaker fact.

If a conclusion is uncertain, leave it uncertain or route it to `REVIEW`.

## 9. Categories

Allowed Topic_Categories:

- PATH
- SELF
- FEELING
- RELATIONSHIP
- GROUP
- EXPRESSION
- REFLECTION
- FUTURE
- BACKGROUND

Multiple categories are allowed.

Primary Topic is separate from Category.

## 10. Primary Anchor

Primary Anchor is set only when the object is central to the VOICE proposition.

A related object is not automatically the anchor.

If an otherwise valid anchor object is not yet represented by a canonical HHA object:

- do not invent an HHA permanent key
- create a PROVISIONAL anchor candidate
- retain evidence and label
- resolve later

## 11. Theme specificity

A THEME Thread must represent a concrete recurring topic.

The following alone are too abstract to become Theme keys:

- 夢
- 成長
- 努力
- 感情
- 活動
- 頑張る

A normalized Theme should be specific enough that two VOICE records can be meaningfully compared as statements about the same subject.

## 12. Time model

Keep these separate.

- `Published_At` / `Spoken_At`: when the member expressed the statement
- `Referenced_Period`: the period the statement is talking about
- `Temporal_Perspective`: how the present statement relates to another point in time when that relation is explicit or safely grounded

The same past event described at different times generally remains separate VOICE records. Do not collapse them merely because the event is the same.

If one source explicitly separates past and current perspectives, multiple VOICE Candidates may be valid.

## 13. Comparison rules

Allowed `Relation_to_Prior`:

- DUPLICATE
- CONSISTENT
- ELABORATION
- REFRAMING
- EXPLICIT_CHANGE
- TENSION
- UNCLEAR

`EXPLICIT_CHANGE` is allowed only when the Speaker explicitly states or clearly marks a change.

Different wording, later detail, or model inference is not enough.

If the relationship is not sufficiently grounded, use `UNCLEAR` or emit no comparison candidate.

## 14. Thread membership

One VOICE may belong to multiple Threads.

Do not duplicate the VOICE row to represent multiple memberships.

ANCHOR and THEME are parallel thread types.

## 15. Candidate decisions

Machine-side candidate decisions:

- `ACCEPT`: meets extraction contract and is suitable to proceed to human review
- `REJECT`: does not meet VOICE criteria
- `REVIEW`: source is resolved but semantic judgment is not safe enough for ACCEPT/REJECT

These are not the human-facing Notion Status.

Human-facing initial Status remains:

- AUTO INDEXED
- SOURCE CHECKED
- PINNED

Do not introduce `Canonical Verified`.

## 16. Source returnability

Every extracted Meaning Unit and VOICE Candidate must be able to return to the original source.

For Personal Blog Archive processing, retain at minimum:

- Article_ID
- Local_Dir
- article.txt reference
- Original_URL when available
- Published_At when available
- Text_Hash when available

A candidate that cannot be traced back to source text must not be promoted.

## 17. Empty output is valid

A valid resolved source may produce:

```json
{
  "meaning_units": [],
  "voice_candidates": [],
  "thread_candidates": [],
  "comparison_candidates": []
}
```

Alternatively it may produce Meaning Units but zero VOICE Candidates.

Neither case is a failure.

## 18. Preview rules

The first implementation Preview uses 5-10 articles already read during the approved Pilot.

The Preview verifies implementation fidelity only. It does not reopen the Pilot conclusion.

Required checks:

1. Source Resolution
2. Meaning Unit generation
3. VOICE Candidate generation
4. zero-VOICE behavior
5. Primary Anchor
6. Theme Thread specificity
7. Comparison candidate
8. source returnability
9. blocked Speaker mismatch stops before extraction

No large Notion write is allowed at this stage.

## 19. Promotion boundary

Machine extraction output is not automatically human-indexed knowledge.

Only after machine implementation Preview passes may the workflow proceed to:

- Notion Human Index Schema Preview
- a very small Accepted VOICE write Pilot
- read-back verification

Permanent Voice_ID allocation and large-scale processing remain downstream decisions.
