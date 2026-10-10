# MEMBER VOICES — Source Body Boundary Contract v0.1 (DRAFT)

Status: **NON-PRODUCTION DESIGN AND TEST ONLY. NOT DEPLOYED.**
Owner scope: approved isolated Source-First REVIEW Sidecar diagnostic, from checkpoint `VOICE-20261011-38`.
Date: 2026-10-11 JST.

## Confirmed defect: article 35133

The saved historical Provider Pass1 result for article `35133` contains Meaning Unit `U6` and ACCEPT candidate `V5` on tears/emotions. Archived `article.txt` has an adjacent article's preview **after the owning author's signoff and post number #147**. This content is **not** evidence spoken in article `35133`.

Read-only cross-check against the official website:
- Owning article: https://www.hinatazaka46.com/s/official/diary/detail/35133
- The page has the author's post signoff/number, then a preview for `涙`, linked to **article `34996` (2020-08-02)**: https://www.hinatazaka46.com/s/official/diary/detail/34996?cd=member&ima=0000
- Diagnostic: `SOURCE_SCOPE_CONTAMINATION`, specifically `35133/U6` → `35133/V5`.
- **Historical Provider output, original Recovered Gold and approved implementation Preview are not rewritten.** Preserve prior run FAIL and append this finding as a separate diagnostic.

## Data contract: do not confuse a saved web page with the blog body

1. Keep `article.txt` as an immutable source archive. The archive may include a neighbor article preview, links, navigation, or promotional UI text; the file is **not automatically the body**.
2. A later derived `article_body` must carry original `source_ref_key`, original article ID, author, original URL, original archive SHA256, extractor version, `body_hash`, a source-boundary confidence/status and independently recorded evidence.
3. The owner of an excerpt is determined by the **bounded article body**, not by author similarity or literal occurrence anywhere in saved `article.txt`. An adjacent post by the **same member** is still a different article.
4. In nonProduction, a unique human-inspected terminal signoff and an observed navigation/adjacent article tail can establish a **provisional article-specific partition**. This alone must not be generalized to every blog or described as official HTML verification.
5. First preference for a future production implementation is a separately verified DOM-based content-only resolver. HTML selection rules, selectors and source-format differences must be investigated before implementation. Do not guess CSS selectors.
6. For each Provider MU, exact excerpt must occur **unambiguously within bounded article body**. Evidence only in tail is `SOURCE_SCOPE_CONTAMINATION`; both body and tail is ambiguous and blocks; no match is `UNMATCHED_EVIDENCE`.
7. A candidate referring to any out-of-body, missing, duplicated or unknown MU is quarantined `BLOCK_FOR_REVIEW`; never auto-promote or silently erase it from audit history.
8. Relation allowlists, explicit owner approval, Semantic durability criteria, and Gold-vs-Preview conflicts remain separate from this Source Scope Gate.
9. No implicit reclassification of historical Gold, no permanent `VOC-` allocation, no Production SQLite/Notion writes and no new Calibration/Pass2/Pass3 without separate explicit owner authorization.

## Findings under current owner sandbox gate

- Article `25481`: 2/2 proposed sandbox semantic cores inside archive-signoff-bounded body; historical Provider 3/3 MUs inside.
- Article `35133`: 3/3 proposed cores inside body; historical Provider 5/6 MUs inside, `U6` outside, impacting accepted `V5`. Official website independently confirms adjacent `34996` post preview.
- Article `65922`: 4/4 proposed cores inside body; historical Provider 4/4 MUs inside.
- Total: 9/9 sandbox evidence substrings inside provisional body; historical Provider 12/13 MUs inside; historical Provider one MU belongs to the excluded tail.
- Archived source audit figures are **UTF-16 JS code units**; Python code-point offsets differ when astral characters occur. Never copy raw offsets without unit conversion.

## Isolated code / tests and limits

- `member_voices/experiments/review_sidecar_v0_1/source_scope_guard_v0_1.py`: no network, no write; takes an article-specific terminal signature.
- `member_voices/experiments/review_sidecar_v0_1/test_source_scope_guard_v0_1.py`: 18 synthetic cases (Python executed, PASS 18/18) including neighboring text, missing signature, ambiguous evidence, mixed good/bad references and Unicode.
- `member_voices/experiments/review_sidecar_v0_1/SOURCE_SCOPE_GUARD_PYTHON_TEST_RESULT_20261011.json`: results and exact Git blob SHAs.
- `member_voices/experiments/review_sidecar_v0_1/SOURCE_SCOPE_DIAGNOSTIC_20261011.DRAFT.json`: read-only scope contamination report.
- Original saved 28-case REVIEW Sidecar Python/JSON Schema suite is **not yet executed in a local repo checkout**, and current 18/18 does not imply it passed.
- Official site crosscheck has been completed for article **35133 only**. Source-level HTML/body selectors across blog generations remain unverified.

Next safe block: run existing Python Schema/Sidecar tests from source files in a matching nonProduction environment; design a robust source-specific HTML/Body resolver and its fixtures for owner review. No active pipeline patch is authorized by this DRAFT.
