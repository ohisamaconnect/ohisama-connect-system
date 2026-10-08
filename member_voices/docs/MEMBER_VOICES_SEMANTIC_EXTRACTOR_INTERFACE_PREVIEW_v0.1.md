# MEMBER VOICES｜Semantic Extractor Interface Preview v0.1

Status: **PREVIEW IMPLEMENTED — DRY RUN ONLY**  
Date: 2026-10-08 JST  
Basis:
- MEMBER VOICES Schema v1.1
- Extraction / Thread Contract v1.0
- Extraction JSON Contract v1.0
- Source Resolver Safety Gate v1.0
- Mixed Incremental E2E PASS through VOC-000007

## 1. Purpose

This Preview defines the production-facing boundary for semantic extraction without binding MEMBER VOICES to one AI provider.

The semantic provider may be OpenAI, Gemini, a local model, or another implementation.

The provider does **not** own:

- Source identity
- Speaker identity
- permanent Voice_ID
- Notion write
- promotion state

Those remain outside the provider.

## 2. Processing order

```text
Archive Source
  -> Source Resolver Safety Gate
  -> article.txt byte/hash verification
  -> ExtractionRequest
  -> SemanticExtractorProvider
  -> semantic payload only
  -> adapter assembles full Schema v1.1 artifact
  -> JSON Schema Draft 2020-12 validation
  -> source-returnability / attribution invariants
  -> validated extraction artifact
  -> downstream candidate review / promotion
```

If the Source Resolver is BLOCK, the provider is never called.

## 3. Provider-neutral interface

A provider receives an immutable `ExtractionRequest` containing:

- run_id
- resolved Source Reference
- Source Resolution
- full article text
- verified article SHA256

A provider returns only:

- meaning_units
- voice_candidates
- thread_candidates
- comparison_candidates
- warnings

The provider must not return or overwrite Source Reference or Source Resolution.

## 4. Adapter-owned source identity

The adapter copies Source identity from the fresh resolver result.

For Personal Blog Archive, stable returnability uses:

```text
<Native Local_Dir>/article.txt
```

as the logical `text_reference`.

The full local execution path is not treated as source identity.

The adapter also verifies article bytes against the Archive `text_hash` before calling the provider.

## 5. Validation boundary

A provider result is rejected when any of the following occurs:

1. JSON Schema v1.1 validation failure.
2. provider returns forbidden top-level fields such as `source`.
3. Meaning Unit / VOICE Candidate / Thread Speaker differs from confirmed Speaker.
4. Article_ID in a Source Locator differs from the resolved source.
5. `text_reference` differs from the resolved logical source reference.
6. VOICE Candidate references a Meaning Unit absent from the same artifact.
7. Thread references a VOICE Candidate absent from the same artifact.
8. Comparison references VOICE Candidates absent from the same artifact.
9. article.txt SHA256 differs from Archive metadata.
10. Source Resolver is not PASS.

A validation failure is terminal for that extraction attempt. It must not allocate a Voice_ID or write Notion.

## 6. Zero VOICE

A provider may return zero Meaning Units and zero VOICE Candidates.

A provider may also return Meaning Units with zero VOICE Candidates.

Both are valid when Schema and attribution rules pass.

## 7. Preview fixture provider

`ApprovedArtifactFixtureProvider` exists only for validation and dry-run comparison against already-approved Pilot artifacts.

It is not a production semantic extractor.

Its purpose is to prove the provider boundary and validation behavior before a real provider implementation is selected.

## 8. Provider replacement contract

A future production provider only needs to implement:

```python
provider_name: str
extractor_version: str
extract(request: ExtractionRequest) -> Mapping[str, Any]
```

No provider-specific object or response format may leak past the adapter.

## 9. Dry-run scope

This Preview authorizes only:

- a few already-reviewed sources;
- fresh Resolver PASS/BLOCK verification;
- actual article byte/hash check;
- provider-boundary dry run;
- comparison with approved extraction artifacts;
- negative validation tests.

It does not authorize:

- permanent Voice_ID allocation;
- Notion writes;
- bulk Archive processing;
- automatic promotion;
- replacement of human Approval Gates.

## 10. Exit criteria for this Preview

PASS requires:

- valid 0 VOICE artifact accepted;
- valid multi-VOICE artifact accepted;
- fresh article SHA256 verified;
- BLOCK source stopped before provider;
- source identity override rejected;
- wrong Speaker rejected;
- wrong locator rejected;
- malformed Schema output rejected;
- no change to production SQLite allocation state.

After PASS, the next design decision is the production provider implementation and its prompt/version/evaluation contract.
