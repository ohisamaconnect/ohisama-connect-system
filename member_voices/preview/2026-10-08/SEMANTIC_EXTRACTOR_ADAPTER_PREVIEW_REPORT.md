# MEMBER VOICES｜Production Semantic Extractor Adapter Preview Report

Date: 2026-10-08 JST  
Result: **PASS — boundary / dry-run only**  
Permanent Voice_ID allocation: **NONE**  
Notion write: **NONE**  
Bulk Archive processing: **NONE**

## 1. Implementation

Added:

- `member_voices/semantic_extractor.py`
- `member_voices/tests/validate_semantic_extractor_boundary.py`
- `member_voices/docs/MEMBER_VOICES_SEMANTIC_EXTRACTOR_INTERFACE_PREVIEW_v0.1.md`
- GitHub workflow step for semantic extractor boundary validation

The provider interface is provider-neutral.

The provider receives resolved source context + verified article text and returns semantic arrays only.

Source identity and Source Resolution are adapter-owned and cannot be overridden by the provider.

## 2. Live source input audit

### Article 26676 — 松田好花

- article bytes: 2205
- expected SHA256: `169cf19ce0d8302a7b3253d5d17646ed5cf539f2c57b9e19735c187469c1e222`
- actual SHA256: same
- Fresh Resolver: PASS
- approved artifact semantic shape:
  - Meaning Units: 1
  - VOICE Candidates: 0
  - Threads: 0
  - Comparisons: 0
- dry-run interpretation: valid zero-VOICE route

### Article 65922 — 大田美月

- article bytes: 17538
- expected SHA256: `03f00076235557186449c82024db4987ad07dff9468534f726a37f099c66d7a4`
- actual SHA256: same
- Fresh Resolver: PASS
- approved artifact semantic shape:
  - Meaning Units: 2
  - VOICE Candidates: 2
  - Theme Thread Candidates: 1
  - Comparisons: 0
  - Warnings: 1
- fixture-provider semantic payload is unchanged from the already-approved artifact
- adapter-owned Source identity remains the fresh Resolver source
- logical text reference is normalized to the Archive Native Local_Dir + `/article.txt`

### Article 71234 — ポカ / negative Speaker case

- article bytes: 3505
- expected SHA256: `0ed6c64fa4e878d46e334f568a754cad714ad1981856380eba1b13e2a724c1e1`
- actual SHA256: same
- metadata Author: ポカ
- test expected Speaker: 小坂 菜緒
- Fresh Resolver: BLOCK / SPEAKER_MISMATCH
- provider invocation: forbidden
- semantic output: none
- Voice_ID allocation: none

## 3. Boundary tests

The validation suite covers:

- valid Schema v1.1 artifact
- valid zero-VOICE artifact
- provider attempt to overwrite Source identity -> rejected
- wrong Speaker -> rejected
- wrong text_reference -> rejected
- article hash mismatch -> rejected
- Resolver BLOCK -> provider entry rejected

The workflow now installs `jsonschema` explicitly and runs the new boundary validation.

At checkpoint creation time, a GitHub Actions run was not observable through the available connector, so Actions PASS is **not** claimed as evidence.

## 4. Production SQLite invariant

Read-only audit before/after this Preview:

- integrity_check = ok
- COMMITTED = 7
- RESERVED = 0
- MAX(sequence_no) = 7
- highest permanent Voice_ID = VOC-000007
- SHA256 = `b3674236a63ce760c50b29610e01f627d11d847317914f5d95c7ab6cc08305de`

Therefore the next permanent ID remains `VOC-000008`.

## 5. What this PASS means

PASS means the **provider boundary is ready**:

```text
Fresh Resolver PASS
  -> verified article bytes
  -> provider-neutral ExtractionRequest
  -> semantic provider
  -> Schema + attribution + returnability validation
  -> validated extraction artifact
```

It does **not** mean a production semantic model/provider has been selected or validated.

`ApprovedArtifactFixtureProvider` is Preview/test-only.

## 6. Remaining production decision

Next block should define and evaluate the real semantic provider implementation:

- provider choice / fallback strategy
- exact prompt contract
- extractor_version discipline
- deterministic key generation boundary
- retry / invalid-output handling
- evaluation against the approved 60-article Pilot
- acceptance thresholds before any larger processing

No bulk processing should begin until that provider/evaluation block passes a separate Approval Gate.
