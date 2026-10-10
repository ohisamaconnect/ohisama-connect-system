# MEMBER VOICES — General Semantic Selection / Granularity / Boundary Contract v0.2.2 (DRAFT)

**Status: OWNER-AUTHORIZED DRAFT AUTHORING ONLY — NOT DEPLOYED, NOT ADOPTED AS PRODUCTION CONTRACT**

- Authorization: \`MV-CAL10-RECON-APPROVAL-20261010-01\` (2026-10-10 JST).
- Base diagnostic: \`CAL10-P1-20261010-084821\` / Runner v0.2.1 / Gate FAIL, checkpoint \`VOICE-20261010-35.json\`.
- Three-way reconciliation: \`member_voices/eval/CAL10_P1_THREE_WAY_RECONCILIATION_DRAFT_2026-10-10.{md,json}\`.
- Baseline in force: MEMBER VOICES Schema v1.1 + Extraction & Thread Contract v1.0 + existing semantic provider Prompt/Runner v0.2.1 + Recovered Calibration Manifest v0.2. This DRAFT does **not** supersede them.
- No new Pass1, Pass2 or Pass3. No Gold, approved Preview, Canonical Voice, SQLite, Notion, HHA, Archive, production Runner, automation trigger, or active prompt/schema mutation authorized.

## 1. Problem statement and evidence boundaries

Fresh Calibration Pass1 completed 10/10 but failed exact-count (5/10), within-one (9/10), runtime invariant (8/10), and strict semantic-selection diagnostics. Exact-count matching can hide a change of subject (\`67706\`). \`50967\` showed a merge of two distinct Accepted cores and a borderline location into one VOICE. \`25939\` and \`44109\` emitted song *names* into Canonical-ID relation arrays with empty RELATION_CONTEXT; the existing adapter correctly blocked them. Provider also missed the \`33683\` habit-reflection core and \`65922\` love-letter core.

**Reference conflict is distinct from extraction quality.** Original Recovered Gold is semantic-core-level only, not full v1.1. Approved implementation Previews are separately documented and differ from Gold for \`25481\` (2 vs 1), \`35133\` (3 vs 2), and \`65922\` (3 vs 2, differing selected topics). Retain both as immutable evidence. None is silently rewritten, promoted to a universal new oracle or used for count-based prompting.

## 2. Entity and decision definitions

- **Meaning Unit (MU)**: grounded single self-position/experience proposition or coherent experience-flow for analysis. It is not a permanent knowledge unit.
- **VOICE**: independently retrievable, durable, attributed human knowledge proposition. It may have multiple closely connected MUs, but multiple topics related to the same article/object do not by themselves make one VOICE.
- **ACCEPT**: enough source-grounded first-person specificity *and* independent long-term retrieval/comparison value. An announcement can contain an acceptable interpretation, but not merely because a historically important thing is mentioned.
- **REVIEW/BORDERLINE**: evidence is grounded but semantic importance, boundary, attribution, scope or independent retrievability remains unresolved. The unit remains visible with its evidence; no automatic acceptance.
- **REJECT**: temporary announcement/schedule, routine daily-life fact, generic appreciation/effort, inferred statement, or redundant fragment without an independently durable statement. 0-VOICE output is legitimate.
- **Relation**: only exact canonical IDs in the current typed RELATION_CONTEXT; source labels may remain human-readable but never masquerade as IDs.
- **Reference Authority**: a recovered historical semantic core, approved implementation Preview, and a Provider run are three *different* artifacts; adjudication is a human decision.

## 3. General test for independently durable propositions

A proposed standalone VOICE should answer, with direct Article evidence:
1. Who is speaking, and what did they personally say, interpret, feel, reflect upon or intend?
2. What concrete proposition would remain meaningful when retrieved later, rather than only explaining that day's announcement?
3. Would separating it allow a later independently meaningful comparison, question, or chronology entry?
4. Is it more than a named object/role/event, a routine expression of gratitude or a grounded one-off fact?
5. If combined with a neighbor MU, does the same central proposition remain complete **without losing a separate, durable statement**?

Do **not** use the number of sentences, number of paragraphs, one article's expected count, entity identity, abstract topic, or time period alone as a split/merge rule. Past/current/future changes matter only when independently durable self-positions are explicitly present. Likewise, grounded extra material is a candidate to adjudicate, not automatically a false positive.

## 4. DRAFT disposition and assertion roles

To preserve boundary decisions in nonproduction evaluation, propose adding:

- MU \`disposition: ACCEPT | REVIEW | REJECT\`. Keep legacy \`voice_eligible\` during a migration proposal as compatibility field, with the cross-field invariant \`voice_eligible == (disposition == ACCEPT)\`.
- VOICE Candidate \`asserted_unit_refs\`: MUs whose self-position the VOICE candidate asserts.
- VOICE Candidate \`context_only_refs\`: background MUs or borderline evidence not asserted as accepted fact.
- Existing \`meaning_unit_refs\` must be a disjoint union of both arrays. No duplicate references.
- An ACCEPT candidate requires at least one asserted MU; **every asserted MU must be ACCEPT**. A REVIEW candidate can reference only REVIEW material without satisfying the old adapter's \`any(voice_eligible)\` requirement. Its holding status is not a permanent VOICE.
- A REVIEW contextual MU may be mentioned as uncertain background, but it must not be transformed into an independent accepted assertion by the title, summary or Thread/Comparison.
- A DRAFT staging adapter / regression auditor may flag candidate merges across separately annotated semantic cores. It is a **review flag**, not an automatic substitute for human meaning judgment.

**Important integration limitation:** The active \`semantic_provider_contract.py\` checks \`any(voice_eligible)\` for VOICE candidates and materializes a v1.1 artifact. It is **not compatible with REVIEW-only staged candidates**. No change to this active adapter is included here. DRAFT output must remain in the isolated staging/test path until a separately approved, tested integration plan addresses schema compatibility and migration. A future decision may choose a separate REVIEW ledger instead of altering the production payload schema.

## 5. Relation allow-list hard invariant

For each typed output field:

| Provider field | RELATION_CONTEXT type |
| --- | --- |
| related_members | MEMBER |
| related_songs | SONG |
| related_lives | LIVE |
| related_events | EVENT |
| related_releases | RELEASE |

For every array value, require exact membership among the IDs supplied for that type **for that run**. Empty allow-list requires empty array. Reject labels and unprovided IDs; the existing runtime invariant remains fail-closed. For an unresolved central object, use only a supported PROVISIONAL anchor with object_id=null and source-grounded label. A Preview's prior HHA ID is not transferred into a separate Calibration run with empty relation context.

## 6. Versioned reference reconciliation and evaluation

Evaluation needs a **typed three-source matrix** for each source:
- Recovered Gold (historical semantic cores, lineage, original count, incomplete v1.1 fields explicitly marked).
- Approved implementation Preview, if it exists (path, approval lineage and meaning/granularity; no assumption if absent).
- Provider output (current run/hash, candidate core, rejected/review MUs and runtime invariant errors).

A manually audited semantic-core map captures \`MATCH | MISSING | EXTRA | SUBSTITUTED | MERGED | BORDERLINE_ABSORBED | REFERENCE_CONFLICT\`; one output may have multiple flags. A count equality cannot clear missing/extra flags. Conflict between Gold/Preview blocks any claim that a single new approved oracle or target count has been resolved.

There is **no automatic replacement of Recovered Gold** here. Reconciliation is research/evaluation evidence. Full Production metrics excluded by the recovered-eval contract remain excluded.

## 7. Test coverage and acceptance boundaries

Isolated code: \`member_voices/experiments/cal10_draft_v0_2_2/\`
- \`validate_contract_draft_v0_2_2.py\`: stdlib-only diagnostic/test harness; manually labelled semantic-core comparison; no API/network/production calls.
- \`regression_cases_v0_2_2.json\`: 13 synthetic generic scenarios. They are deliberately **not** the actual Calibration ten articles.
- Draft schema: \`member_voices/schemas/member_voices_provider_payload_v0_2_2.DRAFT.schema.json\`.
- Draft prompt: \`member_voices/prompts/MEMBER_VOICES_SEMANTIC_PROMPT_v0.2.2.DRAFT.md\`.

The tests check: 0-VOICE, false negative/REVIEW retention, grounded extra, count-equal substitution, independently retrievable merge warning, REVIEW-to-ACCEPT boundary absorption, context-only borderline, empty allow-list rejection, known canonical-ID success, reference conflict, exact evidence boundary, inconsistent boolean/tri-state mapping, and assertion/context reference partition.

**Limitations**: In these fixtures, \`core_key\` is supplied by a human-designed synthetic scenario, **not** discovered by model or inferred from prose. The checker proves deterministic contract reactions to labelled inputs; it does *not* prove Provider semantic accuracy, test the real 10 article texts end-to-end or make permanent Owner semantic decisions. Review flags remain necessary even if machine tests pass.

## 8. Gate and next step

- Current Owner Gate \`MV-CAL10-RECON-APPROVAL-20261010-01\`: **APPROVED FOR DRAFT + ISOLATED REGRESSION ONLY**.
- Status after this work: DRAFT documents/code may be preserved and read back, but baseline Prompt, Gold, Schema, Adapter, Runtime, Production DB and existing checkpoint remain unchanged.
- Next Owner decision after review: choose the reference-conflict adjudication process and whether to adopt tri-state in Production or to keep REVIEW in a separate staging ledger; only then separately authorize integration/revision and eventually one fresh Calibration Pass1.
- Do not proceed to Pass2/Pass3, any new Provider call, mutation to current Gold or permanent VOICE, without subsequent explicit authorization.

## 9. Durability and restart

Save the DRAFT and test result in GitHub, read back all files and exact references, register in Project Control. A new chat should read PC, \`VOICE-20261010-35.json\` and this DRAFT. Mark it **not production-approved**.
