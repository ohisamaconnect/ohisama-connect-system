# MEMBER VOICES — REVIEW Sidecar v0.1 (isolated DRAFT)

**NON-PRODUCTION / NO AUTO-PROMOTION / NO NEW CALIBRATION**

Owner Gate: MV-REF-OWNER-ADJUDICATION-20261011-01 (2026-10-11).
Owner approval covers only **sandbox evaluation of 25481=2, 35133=3, 65922=4 provisional cores**, isolated Sidecar prototype and nonproduction regression. These **are not nine newly accepted permanent VOICEs**.

## Assets and source authority

- Owner decision: ../../eval/CAL10_OWNER_SEMANTIC_SANDBOX_DECISION_20261011.json
- Original Recovered Gold: ../../eval/CALIBRATION_10_RECOVERED_GOLD_v0.1.json (unchanged)
- Original Implementation Previews: ../../preview/2026-10-08/ (unchanged)
- Crosswalk proposal: ../../eval/CAL10_REFERENCE_ADJUDICATION_PACKET_2026-10-11.DRAFT.json (original owner_decision=null preserved; later Owner approval is a separate record)
- Three-case Source Identity Manifest: THREE_CASE_SOURCE_IDENTITY_MANIFEST_20261011.DRAFT.json (crosschecked with original Gold and Preview)
- Nine REVIEW records: SANDBOX_THREE_CASE_LEDGER_20261011.DRAFT.json
- Contract: review_sidecar_v0_1.DRAFT.schema.json
- Read-only Python validator: validate_review_sidecar_v0_1.py
- Read-only Python synthetic tests: test_review_sidecar_v0_1.py
- Regression audit: REVIEW_SIDECAR_REGRESSION_AUDIT_20261011.json

## Isolation and approval semantics

Source identity → Owner sandbox decision and historical crosswalk → DRAFT REVIEW ledger → fail-closed offline validation → separate human promotion decision → STOP.

There is no connection from this prototype to active Semantic Provider, semantic_provider_contract.py, promotion_writer.py, Google Apps Script, Notion VOICE, Production SQLite, Gold, or permanent VOC IDs.

Every item carries owner_semantic_status=APPROVED_FOR_SANDBOX_ONLY, but also owner_promotion_status=NOT_AUTHORIZED and disposition=REVIEW with voice_eligible=false. A sandbox semantic hypothesis can be evaluated without being accepted into a permanent database or silently replacing Gold.

All articles currently carry article_body_scope_verification=UNVERIFIED_NEEDS_BOUNDARY_CHECK. Nine evidence excerpts were previously found literally in the archived article.txt files, but those files can contain site-navigation/footer data. Exact substring presence is not sufficient to certify that an excerpt falls inside a correctly isolated article body.

## Manual read-only regression commands

From repository root, Python 3.12:

```bash
python -m pip install "jsonschema>=4.20,<5"
python member_voices/experiments/review_sidecar_v0_1/test_review_sidecar_v0_1.py
```

Validate the saved nine-core ledger:

```bash
python member_voices/experiments/review_sidecar_v0_1/validate_review_sidecar_v0_1.py \
 --ledger member_voices/experiments/review_sidecar_v0_1/SANDBOX_THREE_CASE_LEDGER_20261011.DRAFT.json \
 --schema member_voices/experiments/review_sidecar_v0_1/review_sidecar_v0_1.DRAFT.schema.json \
 --decision member_voices/eval/CAL10_OWNER_SEMANTIC_SANDBOX_DECISION_20261011.json \
 --packet member_voices/eval/CAL10_REFERENCE_ADJUDICATION_PACKET_2026-10-11.DRAFT.json \
 --identity-manifest member_voices/experiments/review_sidecar_v0_1/THREE_CASE_SOURCE_IDENTITY_MANIFEST_20261011.DRAFT.json
```

Optional private --source-map JSON maps each article ID to its local article.txt for exact excerpt matching. Never commit private article copies.

**Validation honesty:** A separate in-session JavaScript contract parity audit passed 28/28 synthetic/negative cases. The GitHub Python test script is saved for independent execution, but **has not been executed in that audit**, and full JSON Schema instance validation has not yet been proven for those nine articles.

## Next gate

Further steps require separate authorization for Gold/Preview adjudication, adopting/connecting the Sidecar in a runtime, Production changes, or any new Calibration. Current Calibration Gate remains FAIL, Pass2/Pass3 remain blocked.
