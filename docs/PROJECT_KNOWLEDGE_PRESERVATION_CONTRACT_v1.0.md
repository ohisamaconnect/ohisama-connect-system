# Project Knowledge Preservation Contract v1.0

Status: CURRENT  
Scope: おひさまコネクト番組制作プロジェクト全体  
Owner / Final Approver: あさくらじゅん  
Adopted: 2026-10-08

## 1. Purpose

ChatGPT等の対話環境は作業場であり、長期保存の正本ではない。
調査、監査、比較、設計、実装、本人承認によって生まれた再利用価値のある成果を、チャットの存続に依存せず復旧・検証・再利用できる状態へ昇格させる。

本Contractの目的は「チャット全文を無差別保存すること」ではなく、価値ある知識成果をDurable Artifactとして残すことにある。

## 2. System of Record

### ChatGPT / Work
- 調査・思考・比較・候補生成・Approvalの作業場。
- 唯一の保存先にしてはならない。

### Google Drive
- Evidence Pack、Working Snapshot、Checkpoint、Manifest、原資料コピー等の実体保存。
- 大容量・長期保存・人間が直接閲覧する成果物の主要保管場所。

### GitHub
- Contract、Schema、Template、コード、機械処理規則、再現可能なmanifest仕様の正本。
- 実データや権利上公開できない大量原資料は置かない。

### Notion
- 人間向けIndex / Control Plane。
- Current State、保存先、Approval、Restart Point、Artifact URI、GitHub/Drive参照を保持。
- 大量row-level実体の唯一の正本にはしない。

### Canonical DB
- Cross-Audit / Freeze / Import Gateを通過した最終Canonical Factのみ。
- Working Snapshotや未解決候補の保存場所として代用しない。

## 3. Durable Artifact Classes

### A. Research / Audit Evidence Pack
重要な調査・監査Blockの根拠と判断を保存する。

Minimum:
- Artifact_ID
- Workstream_ID
- Scope
- Purpose
- Source list / Source locator
- Fact findings
- Accepted / Rejected / Unknown / Needs Review
- Decision rationale
- Approval state
- Canonical impact
- Created_At
- Chat reference when available
- Related Artifact IDs

### B. Working Snapshot
Canonical投入前の大量候補・中間状態を再現可能な形で保存する。

Minimum:
- Snapshot_ID
- Workstream_ID
- Contract / Schema version
- Baseline count
- Completeness checks
- Row-level data or durable pointers
- Open issues
- Immutable baseline hash or equivalent integrity marker when practical

### C. Checkpoint
チャット終了・工程完了・Approval Gate通過時の現在地。

Minimum:
- Checkpoint_ID
- Workstream_ID
- Last approved point
- Restart point
- Delta summary
- Contract / Output version
- Durable artifact pointers
- Open issues
- User approval state

### D. Manifest
Artifactの所在と整合性を機械可読に管理する。

Minimum:
- manifest_version
- artifact_id
- artifact_type
- workstream_id
- title
- created_at
- status
- drive_url / drive_file_id when applicable
- github_path / commit_sha when applicable
- notion_url when applicable
- source_chat_reference when available
- parent_artifact_id
- supersedes / superseded_by
- integrity
- notes

## 4. Preservation Triggers

次のいずれかに該当する場合、Durable Artifactを作成する。

1. 重要なApproval Gateを通過した。
2. 10件以上、または複数日・複数Sourceにまたがる監査を行った。
3. Canonical候補、ID、Relation、Schema、Contractを変更・確定した。
4. 再調査に30分以上相当する労力が見込まれる。
5. 次チャットで継続する。
6. ChatGPTチャットが唯一の詳細保持場所になっている。
7. Cross-Audit / Freeze / Import / Migration前のBaselineを確定した。
8. 障害調査・Runtime Auditで将来の復旧に必要な証拠が得られた。

## 5. Chat Closure Preservation Gate

重要Workstreamのチャットは、次を満たすまで「引継ぎ完了」と扱わない。

- [ ] Current StateがProject Controlに反映済み
- [ ] 再利用価値のある詳細結果がDrive等へDurable保存済み
- [ ] Contract / Schema / Code変更があればGitHubへ反映済み
- [ ] NotionにArtifactのIndex / pointerがある
- [ ] ManifestまたはCheckpointで所在が辿れる
- [ ] Open Issues / Needs Reviewが消失していない
- [ ] Restart Pointが一意
- [ ] Readbackで保存結果を確認済み

チャットURLや会話履歴だけを根拠にClosure GateをPASSさせない。

## 6. Naming

推奨形式:

`<WORKSTREAM>_<ARTIFACT_TYPE>_<YYYYMMDD>_<SEQ>_<short-title>`

Examples:
- `PRF_WORKING_SNAPSHOT_20261008_001_FIRST_PASS_BASELINE`
- `PRF_EVIDENCE_PACK_20261008_001_LIV-0344`
- `RUN_CHECKPOINT_20261006_001_RUNTIME_AUDIT`

Artifact_IDは内容の意味と独立した不変識別子を優先する。

## 7. Immutability / Supersession

- Baseline Artifactは後から上書きしない。
- 修正版は新Artifactとして作成し、supersedesで接続する。
- Canonical変更前後の差分を追跡できる状態を維持する。
- 古いArtifactは「古いから削除」せず、不要化が確定した場合もManifestでstatusを残す。

## 8. Privacy / Rights

- 公開権限のない音源、限定配信、個人情報、著作物全文等をGitHub公開領域へ置かない。
- GitHubにはSchema / Contract / metadata / codeを中心に置く。
- Driveの共有設定を保存処理が勝手に拡大しない。
- 原資料とAI生成要約を明確に区別する。

## 9. HHA PERFORMANCES Immediate Application

2026-10-08時点:
- LIV-0001〜LIV-0348 First-Pass Source-First Audit COMPLETE
- Accepted PERFORMANCE Candidates: 4,868
- Open Needs Review: 9
- PERFORMANCES DB write: NONE
- PRF Permanent ID: NOT FIXED

Cross-Audit開始前にFirst-Pass Preservation Gateを実行し、4,868件を改変しないDurable Baselineへ固定する。
Baselineが存在しない限りCross-Audit変更・PRF ID固定・Bulk Importを開始しない。

## 10. Standard Flow

Work
→ Approval
→ Durable Artifact
→ Drive save
→ GitHub Contract/Schema/Code update when needed
→ Notion Index
→ Manifest / Checkpoint
→ Project Control update
→ Readback
→ Chat close / next phase

## 11. Change Control

本ContractはProject-level rule。
変更時は理由、影響範囲、移行方法を明示し、versionを上げる。
