# MEMBER VOICES｜Notion Human Index Schema Preview v1.0

Status: **SCHEMA PREVIEW / NO VOICE WRITE**  
Date: 2026-10-08 JST  
Basis:
- MEMBER VOICES｜Schema v1.1 & Extraction / Thread Contract v1.0
- MEMBER VOICES｜Implementation Handover / Restart v1.0
- Small Reprocessing Preview PASS (2026-10-08)

> This document previews the Notion Human Knowledge Index only.
> It does not create the Notion database, write Accepted VOICE rows, or allocate permanent Voice_ID values.

## 1. Preview conclusion

Initial Human Index should use **one MEMBER VOICES database**.

Do not create separate Notion databases for:
- Source
- Thread
- Comparison
- Meaning Unit
- rejected / review candidates

Those remain in the SQLite + JSON Machine Processing Layer.

This preserves the approved boundary:

```text
Raw Archive / existing Archive identity
  -> Machine Processing Layer
     - Source references
     - Meaning Units
     - all Voice Candidates
     - resolver logs
     - provisional anchors
     - thread candidates
     - comparison records
  -> Notion Human Knowledge Index
     - Accepted VOICE
     - necessary Source Reference
```

The Archive remains the Source Identity Owner.

## 2. Database role

Preview database name:

```text
MEMBER VOICES
```

One row = one Accepted VOICE.

This is **not** one row per article.

A valid source can produce:
- zero Notion rows
- one Notion row
- multiple Notion rows

according to the accepted VOICE granularity.

Title rule remains:

```text
メンバー名｜見出し（内容を少し入れる）
```

## 3. Property schema preview

| Property | Notion Type | Role | Write Pilot |
|---|---|---|---|
| Title | TITLE | Human-readable VOICE title | Required |
| Voice_ID | RICH_TEXT | Permanent MEMBER VOICES ID. Format is not fixed in this Preview | After allocator approval |
| Status | SELECT | AUTO INDEXED / SOURCE CHECKED / PINNED | Required |
| Speaker | RELATION -> HHA MEMBERS | Confirmed speaker, normally one member | Required |
| Summary | RICH_TEXT | Attribution-preserving summary | Required |
| Published_At | DATE | Source publication time | Required for Blog |
| Spoken_At | DATE | Actual spoken time when separately known | Optional |
| Referenced_Period | RICH_TEXT | What past/current period is being discussed | Optional |
| Temporal_Perspective | RICH_TEXT | Retrospective/current/future perspective. Do not freeze as enum yet | Optional |
| Topic_Categories | MULTI_SELECT | PATH / SELF / FEELING / RELATIONSHIP / GROUP / EXPRESSION / REFLECTION / FUTURE / BACKGROUND | Required |
| Primary_Topic | RICH_TEXT | Concrete comparable topic | Required |
| Secondary_Topics | RICH_TEXT | Search support without unbounded select-option growth | Optional |
| Primary_Anchor | RICH_TEXT | Human-readable CANONICAL / PROVISIONAL anchor representation | Optional |
| Related_Members | RELATION -> HHA MEMBERS | Related members, separate from Primary Anchor semantics | Optional |
| Related_Songs | RELATION -> HHA SONGS | HHA Song relation | Optional |
| Related_Lives | RELATION -> HHA LIVES | HHA Live relation | Optional |
| Related_Events | RELATION -> HHA HISTORY EVENTS | HHA History Event relation | Optional |
| Related_Releases | RELATION -> HHA RELEASES | HHA Release relation | Optional |
| Knowledge_Value | RICH_TEXT | Machine-side evaluation when useful to display. No enum fixed yet | Optional |
| Attribution | RICH_TEXT | SELF_STATEMENT etc. | Required |
| Source_System | SELECT | Identity owner such as PERSONAL_BLOG_ARCHIVE | Required |
| Source_Native_ID | RICH_TEXT | Archive Article_ID or equivalent. No second permanent Source ID | Required |
| Source_Title | RICH_TEXT | Original source title | Required |
| Original_URL | URL | Return to original source | Required where available |
| Archive_Reference | URL | Return to preserved Drive/Archive source | Required |
| Source_Locator | RICH_TEXT | Returnable locator such as article.txt path/reference | Required |
| Machine_Candidate_Key | RICH_TEXT | Internal Accepted Candidate join key | Required |
| Meaning_Unit_Refs | RICH_TEXT | Machine-layer audit references | Required |
| Thread_Keys | RICH_TEXT | Machine-side ANCHOR / THEME natural keys when useful | Optional |

## 4. Relation targets verified in current Notion

Use **one-way relations** initially to avoid adding unnecessary reverse properties to HHA.

```text
HHA MEMBERS
  database: https://app.notion.com/p/23030ded40f44bc5ba249dd45ff82f74
  data source: collection://df86e0ba-5478-4fc6-b30a-49cb1bd6c83d

HHA SONGS
  database: https://app.notion.com/p/f761c740215d4f0d9a5143494ff66d64
  data source: collection://a3c08149-498d-4e02-aded-0c5640e5a033

HHA LIVES
  database: https://app.notion.com/p/595af5cff8604f70951b858639850529
  data source: collection://d7d6ad38-379b-4ff6-ba8e-87749087ba59

HHA HISTORY EVENTS
  database: https://app.notion.com/p/108b12e8a4c44d969054baad3b1ea610
  data source: collection://7b058690-dd3f-4012-803e-0b805acc99cf

HHA RELEASES
  database: https://app.notion.com/p/ae27eacd36f9494d866116e6b155bdea
  data source: collection://f0582433-8119-4344-a16b-f5a66121d1eb
```

## 5. Source Reference policy

Do **not** create a separate SOURCE database in the initial Notion layer.

Each Accepted VOICE row keeps only the Source fields needed for human returnability and machine join-back.

For Personal Blog Archive, minimum Notion Source Reference:

- Source_System
- Source_Native_ID = Article_ID
- Source_Title
- Published_At
- Original_URL
- Archive_Reference
- Source_Locator
- Machine_Candidate_Key
- Meaning_Unit_Refs

Keep these in SQLite / JSON only unless later proven necessary in Notion:

- Text hash
- full Source metadata
- resolver logs
- rejected candidates
- all Meaning Unit details
- Source Resolution event history

This prevents Notion from becoming another Raw Archive.

## 6. Primary Anchor policy

Notion Relation properties are tied to one target data source, so a single polymorphic relation cannot cleanly point to Member / Song / Live / Event / Release.

Initial Human Index representation:

```text
Primary_Anchor = human-readable RICH_TEXT
Canonical object = also present in the matching Related_* HHA Relation
Machine layer = authoritative object type + object ID
```

Canonical example:

```text
CANONICAL | SONG | SNG-090 | 月と星が踊るMidnight
```

Provisional example:

```text
PROVISIONAL | LIVE_OR_EVENT | 新参者（2025年・五期生公演）
```

A PROVISIONAL anchor must not create a fake HHA ID or fake HHA relation.

## 7. Thread / Comparison Notion boundary

Do not create a Thread DB initially.

Do not create a Comparison DB initially.

SQLite / JSON remains authoritative for:

- ANCHOR Thread Candidate
- THEME Thread Candidate
- Comparison Record
- Relation_to_Prior
- Explicit_Change_Claimed
- comparison evidence

Notion exposes enough human index fields to browse chronologically:

- Speaker
- Published_At
- Primary_Topic
- HHA Relations
- Thread_Keys

This keeps Threads as **time-series indexes**, not AI-authored narratives.

## 8. Initial views preview

If the database is created after approval, start with only:

1. **All VOICES** — Published_At DESC
2. **Review Queue** — Status = AUTO INDEXED
3. **Source Checked** — Status = SOURCE CHECKED
4. **Pinned** — Status = PINNED
5. **By Speaker** — group by Speaker, Published_At DESC

Do not add a dedicated Thread view until real usage shows it is helpful.

## 9. Small write Pilot candidates

These are **preview candidates only**. No Notion rows are written by this document.

### A. 小坂菜緒 / Article 25481

Purpose:
- verifies 2 Meaning Units -> 1 Accepted VOICE
- verifies anti-over-fragmentation
- simple Source returnability

### B. 小坂菜緒 / Article 35133

Purpose:
- verifies Temporal Perspective
- verifies Theme Thread key exposure
- verifies later comparison behavior without collapsing perspectives

### C. 大田美月 / Article 65922

Purpose:
- verifies PROVISIONAL Primary Anchor
- confirms no fake HHA object is minted

### D. 大田美月 / Article 67706

Purpose:
- verifies Canonical Song anchor
- verifies HHA SONG relation
- expected Song relation: SNG-090 / 月と星が踊るMidnight

Article 26676 is intentionally not a Notion write target because its expected Human Index result is **zero VOICE / zero row**.

## 10. Permanent Voice_ID remains unresolved

Schema v1.1 requires a `Voice_ID` field but the canonical documents do not define its permanent string format.

Therefore this Preview does **not** silently canonize values such as:

```text
VOC-000001
```

The next write gate must explicitly fix:

- prefix
- digit width
- start number
- allocator rule
- idempotent retry rule
- Preview / failed write behavior
- rule that retries must not consume extra permanent IDs

No permanent Voice_ID has been consumed yet.

## 11. Schema Preview acceptance criteria

Schema Preview can pass only if all remain true:

- Notion stores Accepted VOICE only
- Source identity remains owned by the existing Archive
- every VOICE can return to its source
- Speaker is related to HHA MEMBERS
- Member / Song / Live / Event / Release relations can point to current HHA databases
- Related object and Primary Anchor remain distinct concepts
- PROVISIONAL Anchor cannot create a fake HHA ID
- zero-VOICE sources produce no Notion row
- Thread / Comparison do not require extra Notion databases initially
- Human-facing Status is only AUTO INDEXED / SOURCE CHECKED / PINNED
- Canonical Verified is not used
- the structure does not declare an AI-authored growth narrative
- the Notion row can return to the Machine Candidate / Meaning Units

## 12. Next gate after schema approval

```text
Fix Voice_ID allocator rule
  ->
create minimal MEMBER VOICES Notion database
  ->
write approximately 4 Accepted VOICE rows
  ->
read-back verify
  ->
audit HHA relations / Source returnability / Status / idempotency
  ->
next Approval Gate
```

This gate does not authorize large-scale processing or bulk Notion writes.

## 13. Current connector constraint

During this implementation session, Notion page update and page creation writes were rejected by the tool's safety check even for a minimal empty Preview page.

Observed result:
- Project Control remains at v1.86 / PC-20261007-86
- Delta_ID VOICE-20261008-25 is not written to Project Control
- no MEMBER VOICES Notion database/page was created
- no Accepted VOICE was written

Do not treat those Notion writes as completed.

The schema design and relation targets above were verified read-only and stored here so the work can continue without falsifying Notion state.
