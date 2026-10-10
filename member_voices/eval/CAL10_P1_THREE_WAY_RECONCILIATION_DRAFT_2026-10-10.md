# MEMBER VOICES — CAL10 Pass1 Three-Way Reconciliation & General Remediation (DRAFT)

Status: **DRAFT / AWAITING OWNER APPROVAL / NO CONTRACT OR PRODUCTION CHANGE**
Date: 2026-10-10 JST
Workstream: MEMBER_VOICES
Base Project Control: PC-20261010-128
Readback checkpoint: `member_voices/checkpoints/VOICE-20261010-35.json`
Run: `CAL10-P1-20261010-084821` / Runner v0.2.1 / `gemini-3.8-flash`, medium
Calibration: **FAIL**; Pass2 and Pass3 **NOT AUTHORIZED**.
This report is diagnostic and may be cited as a proposal. It does not approve or change Gold, Prompt, Schema, semantic criteria, Production SQLite, Notion VOICE, permanent IDs, or triggers.

## Provenance and interpretation
- Recovered Gold: `member_voices/eval/CALIBRATION_10_RECOVERED_GOLD_v0.1.json` (10 original case identities; Gold type `RECOVERED_APPROVED_CORE`; **not full v1.1 artifacts**).
- Implemented, previously approved extraction previews where available: `member_voices/preview/2026-10-08/{25481,26676,35133,65922,67706}_*.json` (5 cases; different purpose/version from recovered Gold).
- Provider results: Drive folder `1CG2JfoaNTI9ztf2PGHXhXzVx7ruKUTVm`; individual resultFileIds in `VOICE-20261010-35.json`. All 10 provider records read back.
- Manifest: `member_voices/eval/CALIBRATION_10_MANIFEST.ready.json`, `manifest_version=0.2`; `relation_context={}` for the 10 Calibration sources. Empty relation context is *not* authority to fabricate Canonical IDs.
- The three columns are distinct evidence artifacts. Recovered Gold is a historical recovered semantic core, an implementation Preview is a later implementation example, and Provider is a live v0.2.1 evaluation output. Counts across these columns do **not** automatically have a single authoritative interpretation.
- No source article or historical reference is silently rewritten by this report.

## Case-by-case Three-Way Reconciliation Matrix

| Case / Article_ID | Recovered Gold (count / approved semantic cores) | Existing Implementation Preview | Provider v0.2.1 (Accepted count / content) | Classification / reconciliation |
|---|---|---|---|---|
| 01 / `25481` | **2**: audition-era doubts and yearning; present CM responsibility / encouragement of applicants | **1**: audition origin and encouragement merged into one experience flow | **2**: audition recollection; CM / prospective applicants | **Semantic Gold-aligned / Preview granularity conflict**. Provider is not a failure merely because Preview was one VOICE. Require general independent-proposition rule, not target count. |
| 02 / `26676` | **0**: routine phone, flowers, daily photos not durable | **0** | **0** | **PASS**, zero-VOICE negative control preserved. |
| 03 / `33683` | **1**: small goals / difficulty of forming habits | *No stored implementation Preview found in five-file set* | **0**: routine radio calisthenics / daily-life MUs rejected | **FALSE NEGATIVE vs recovered core**, possible durability-threshold ambiguity. The Archive title was available; do not repeat earlier title-missing diagnosis as root cause. |
| 04 / `35133` | **3**: (A) four-center burden, (B) emotional relief/complexity upon handoff, (C) second-chapter future | **2**: past center burden, then current relief + future chapter merged | **5**: three Gold cores V1/V2/V4 + additional support-new-center V3 and tears/emotion V5 | **OVER-SELECTION vs recovered core + Gold/Preview granularity conflict.** Extra voices are grounded but acceptance is not settled solely by groundedness. Exact-evidence invariant PASS. |
| 05 / `65922` | **3**: blog as letter to fans; `桜梅桃李` with self-comparison; blog as first step toward dream | **2**: `桜梅桃李` and dance/expression ambition | **4**: `桜梅桃李`, dance performance ambition, twintail identity, blog dream-step; missed fan love-letter | **FALSE NEGATIVE + OVER-SELECTION vs recovered core + MATERIAL REFERENCE CONFLICT.** Provider matches both Preview cores; dance is Preview-approved and must not be automatically tagged 'false positive'. Recovered Gold does not authorize erasing Preview. |
| 06 / `67706` | **2**: song/dream achievement; happiness seeing peers appear on television | **2**: same two cores, including canonical SONG `SNG-090` in Preview's own context | **2**: song/dream achievement; friendship with 稲熊ひな, **not** peer-TV joy | **SEMANTIC SUBSTITUTION despite exact count**. Relation context of this Calibration run is empty even though older Preview had a linked SONG; do not copy IDs across contexts. |
| 07 / `50967` | **2 ACCEPT**: childhood dream of photobook; self-image (unchanged/new). **1 BORDERLINE**: personally significant power-spot shooting locations | *No stored Preview* | **1**: all dream + power spots + self-image bundled | **OVER-MERGE + BOUNDARY ABSORPTION**. Both accepted cores were detected as MUs but collapsed with a borderline into one VOICE. |
| 08 / `55209` | **2**: complex self-reflection / kindness; appreciation for others changing fixed assumptions | *No stored Preview* | **2**: same two broad cores; routine song first impression rejected | **PASS** semantic and runtime. |
| 09 / `25939` | **2**: modeling dream / TGC journey; 今泉佑唯 graduation feelings and memory | *No stored Preview* | **2** semantically aligned | **RELATION ALLOW-LIST FAIL**, `related_songs=["夏の花は向日葵だけじゃない"]` even though relation context empty; validator correctly blocks. |
| 10 / `44109` | **1**: ceremonial first pitch dream, tension, bounced ball, renewed wish | *No stored Preview* | **2**: Gold core plus '僕なんか' 22-member release observation | **OVER-SELECTION + RELATION ALLOW-LIST FAIL** (`related_songs=["僕なんか"]`). Announcement-related extra needs semantic adjudication; validator correctly blocks. |

The 5 existing previews are **25481, 26676, 35133, 65922, 67706**. The absence of a Preview in this directory for the other five cases means **Preview unavailable here**, not 'approved zero VOICE' or proof that no other artifact exists.

## Error taxonomy generalized — not case-specific hacks

1. **False negative / threshold drift:** A concrete first-person interpretation can be lost by an overly strict 'daily activity' filter (33683), by omission despite other accepted MUs (65922 love-letter), or by attention to other grounded relations (67706 peer-TV happiness). Distinguish durable *interpretation* from routine factual content; record omitted core independently of count.
2. **Over-selection / grounded is not sufficient:** 35133 extra new-center relation and emotion statement; 65922 twintail identity and dance ambition relative to historical Gold (the latter already accepted in Preview); 44109 promotional release observation. Do not assume extra = invalid when preview disagreement exists. Assess independent enduring self-positioning, salience, and redundancy; avoid article-specific quotas.
3. **Semantic substitution:** 67706 has correct 2/2 count but one expected proposition was replaced by an unrelated yet grounded relation. Evaluate core-to-core alignment and missing/extra independently, not only count.
4. **Over-merge:** 50967 binds independently retrievable photobook-long-term-dream and personal-expression/self-image claims into one multi-topic VOICE solely due to shared artifact. Co-reference to one photo book / event is insufficient to merge central propositions.
5. **Boundary absorption:** 50967 'power spots' was historically BORDERLINE, but entered accepted VOICE summary without preserving that distinction. Store a reviewable boundary decision and do not upgrade borderline by merging it with accepted material.
6. **Relation allow-list:** 25939 and 44109 place plain song title labels into Canonical `related_songs` when `RELATION_CONTEXT` is empty. This is invalid regardless of textual support. Preserve title in human-readable text/evidence or PROVISIONAL anchor when allowed, not in canonical-ID arrays. Keep fail-closed validator.
7. **Reference authority and granularity disagreement:** 25481 Gold2/Preview1; 35133 Gold3/Preview2; 65922 Gold3/Preview2 with divergent selected content. This is an **evaluation oracle problem**, separate from Provider error. Do not change Recovered Gold to fit Provider, or tune Provider to one historical count.

## Proposed GENERAL CONTRACT change set (NOT APPLIED)

**A — Reference adjudication and metrics (evaluation contract):**
- Maintain `Recovered Gold` and `Implementation Preview` as separately versioned, hash-pinned sources with a structured `REFERENCE_CONFLICT` register; never silently overwrite either.
- Mark exact-count grading *against recovered Gold* as a historical diagnostic when approved Preview conflicts; label it `UNRESOLVED_REFERENCE` for any new 'approved semantic performance' gate until Owner adjudicates. Do not retroactively change the recorded FAIL.
- Use bipartite semantic-core mapping: matched, missing, extra, merged, boundary-absorbed, substituted; compare by proposition, temporal perspective, speaker and evidence, not by count alone. Zero-VOICE safety and run invariant remain hard gates.
- Calibration fail still blocks Pass2/Pass3 and Production writes; a new full Pass1 is a separate post-implementation check.

**B — Semantic selection contract (cross-article criteria):**
- Eligible VOICE must have an explicit attributable first-person experience / interpretation / lasting self-position / particular relationship / meaningful intention, with evidence and future retrieval value. Mere explicitness, specificity, groundedness, or mention of an important HHA object alone is insufficient.
- Distinguish routine activity from the speaker's abstracted self-reflection without forbidding short statements (33683); put ambiguous cases into REVIEW rather than rejecting mechanically, pending Owner criteria confirmation.
- In the review ledger keep `why durable`, `why standalone`, `why not routine`, `evidence`, `source proposition`, and `confidence or uncertainty`; no new 'one article = N voices' shortcut.
- Extra grounded interpretations should be classified `NEW_CANDIDATE_FOR_OWNER_REVIEW` when Gold and Preview disagree, not automatically True Positive or False Positive.

**C — Meaning Unit -> VOICE granularity / boundary contract:**
- First inventory all distinct first-person semantic propositions as MUs, then classify each ACCEPT/REVIEW/REJECT, then assemble VOICE Candidates. Preserve a rejected/reviewed MU as a separate audit item even if it shares a source object with an ACCEPT.
- Merge **only** when source MUs form one non-separable central claim / coherent experience-flow without losing separately comparable self-positions. Same article, entity, release, event, or topic does not establish merge identity.
- Split when a proposition is independently summarizable and independently relevant to future longitudinal comparison; **do not mechanically split each past/present/future phase**. Past/current/future distinctions inform the independent-proposition test rather than dictate a quota.
- Explicit boundary defense: a REVIEW/BORDERLINE MU cannot be absorbed into an ACCEPT VOICE summary as if approved. If context is necessary, it can remain traceable as background and its status must remain visible.

**D — Provider output Schema and adapter (minimal contract-safe revision proposal):**
- The current provider Schema v0.1 offers `voice_eligible: boolean` at MU level and `candidate_decision: ACCEPT|REJECT|REVIEW` at VC level. The adapter also requires at least one `voice_eligible=true` MU in every Candidate. This makes a clean review-only boundary MU/candidate awkward.
- Propose a versioned, backward-explicit tri-state MU disposition `ACCEPT|REVIEW|REJECT` (or equivalent REVIEW tracking outside payload) with a consistency rule against existing `voice_eligible`. If changing Schema, update validator, adapter, evaluation and runner atomically under separate version labels; never silently reinterpret old v0.2.1 results.
- The current schema should **not** be changed just to increase the total count: any update must serve auditability and boundary preservation, with explicit regression fixtures.

**E — Relation safety and prompt (general rule):**
- Any `related_members|songs|lives|events|releases` ID must be a verbatim member of the current, typed `RELATION_CONTEXT` allow-list. If that type has no allow-list entries, its output array must be empty.
- A mentioned name/title is not an ID; no lookup or fill-in by intuition. Mention labels only in free text/evidence or supported PROVISIONAL anchor; do not silently drop or translate invalid canonical IDs.
- Keep deterministic fail-closed invariant and expose a precise diagnostic; test both empty and nonempty allow-list, bogus label, and valid object ID.

**F — Regression and controlled re-evaluation:**
- Add test fixtures for all **six failure classes** plus disagreement-aware reference handling: no-title shortcut, 0-VOICE negative, threshold borderline, independent temporal positions, extra-grounded candidate, semantic substitution with matching count, two ACCEPT + one REVIEW boundary, song-label with empty allow-list, and valid canonical song in populated context.
- Require fixed input title/body/hash, Prompt hash, Schema hash, model settings, resultFileId; preserve old results unchanged.
- First implement and static-test any **approved** general revisions as DRAFT without Production mutations, then run only one new authorized Calibration Pass1 after the reference authority problem is adjudicated; report both strict semantic review and counts. **Do not run Pass2/Pass3 now.**

## SINGLE EXPLICIT OWNER APPROVAL GATE (PENDING)

**Gate ID:** `MV-CAL10-RECON-APPROVAL-20261010-01`
**Question:** Approve this **general remediation plan as a scoped next implementation/evaluation design**, with the following boundaries?

- YES would authorize drafting and implementing a **versioned general semantic selection/granularity/boundary revision and matching Prompt, with a narrowly scoped Schema+adapter change only if required to represent tri-state REVIEW**, plus relation allow-list regression tests, **all still in non-Production DRAFT/PREVIEW**.
- YES would authorize creating a structured reference-conflict ledger for 25481 / 35133 / 65922; it would **not** adjudicate them automatically and would **not** modify Recovered Gold or an approved Preview.
- YES would **not** authorize a new Gemini Calibration run, Pass2/Pass3, permanent Voice_ID allocation, Notion/Production SQLite writes, trigger changes, mass archive work, or Gold rewrite. These require subsequent explicit permission under the established gates.
- NO / HOLD means keep the current artifacts untouched and return only a narrower revised design.

**Awaiting human response:** `承認` / `修正` / `保留`.

## Preservation / restart protocol
- Preserve this file in GitHub under a new DRAFT filename, then read it back and register its exact path in Project Control as *pending approval*, not as approved Contract.
- Existing `VOICE-20261010-35.json` remains the executed diagnostic checkpoint and unchanged production-state authority.
- Next chat restart: fetch current Project Control + `VOICE-20261010-35.json` + this DRAFT report, read back actual Gold/Preview/Provider where the decision needs them, and do not infer that a DRAFT has been approved.
