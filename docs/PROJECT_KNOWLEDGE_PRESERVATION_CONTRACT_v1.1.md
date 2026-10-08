# Project Knowledge Preservation Contract v1.1

Status: CURRENT
Scope: おひさまコネクト番組制作プロジェクト全体
Owner / Final Approver: あさくらじゅん
Adopted: 2026-10-08
Supersedes: v1.0

## 1. Core Principle

ChatGPT / Workのチャットは作業場であり、長期参照の正本ではない。

重要なのは「調査した事実を要約して保存すること」ではなく、**今後必要になる実データを出力したなら、その実データ自体をチャット外へ保存すること**である。

例:
- ライブのSetlist
- 曲順
- SONG Relation
- Performing_Members
- Center
- Length / Form
- Rejected Candidate
- Unknown / Partial
- Fact-Level Conflict
- Source / Evidence
- Approval状態

これらをチャット内だけに残してはならない。

## 2. No-Chat-Dependency Rule

通常運用において、将来のAIまたは人間が
「過去チャットを検索して、初回監査で何が確定したかを再構成する」
ことを必要とする設計を禁止する。

過去チャット参照は、
- 災害復旧
- 欠損修復
- 監査証跡確認
のための補助手段に限定する。

日常の再開・Cross-Audit・差分確認・再利用は、Drive / Canonical DB / Working Snapshot / Manifest / Notion Indexから直接行える状態を標準とする。

## 3. Data-Bearing Preservation Rule

監査・調査・設計でrow-levelまたはrecord-levelの再利用可能データを生成した場合、保存対象はCheckpoint要約ではなく**Data-Bearing Artifact**である。

Checkpointのみを保存しても、元データがチャットにしか存在しない場合はPreservation PASSとしない。

Data-Bearing Artifactの例:
- CSV / TSV
- Google Sheet
- JSON / JSONL
- SQLite
- Markdown table
- XLSX
- Canonical DB staging table

## 4. Approval-to-Artifact Rule

重要なApproval Gateでは、原則として以下を一続きの処理とする。

Research / Audit
→ Proposed Output
→ User Approval
→ Approved row-level dataをDurable Artifactへ書込
→ Readback / count / integrity確認
→ Artifact Register更新
→ Project Control Checkpoint
→ 次Block

「全監査が終わってからまとめて保存」だけに依存しない。

大量監査では、Blockまたは安全なBatch単位でApproved dataを追記保存し、途中チャットが失われても承認済み部分を復元できるようにする。

## 5. Minimum Stored Fields for Research/Audit Data

対象分野に応じて必要な実データを保持する。

共通最低項目:
- Workstream_ID
- Subject / Record locator
- Sequence / Order when relevant
- Canonical relation target when relevant
- Fact value
- Verification status
- Evidence locator
- Decision status
- Decision rationale or note
- Approval state
- Approval checkpoint
- Created / Updated at

HHA PERFORMANCES最低項目:
- LIVE_ID
- LIVE title
- Date
- Sequence
- Stage Occurrence / PERFORMANCE
- SONG Relation
- Form / Length
- Performing_Members
- Performing_Members_Status
- Center
- Center_Status
- Candidate Status
- Evidence / Source locator
- Canonical judgment / note
- Approval Block / Checkpoint

## 6. System of Record

### ChatGPT / Work
作業場。唯一の保存先にしない。

### Google Drive
Data-Bearing Artifact、Evidence Pack、Working Snapshot、Checkpoint、Manifestの主要実体保存。

### GitHub
Contract、Schema、Template、Code、機械処理規則のversioned canonical。

### Notion
Human Index / Control Plane。Current State、Approval、Restart Point、Artifact pointerを保持。

### Canonical DB
Freeze / Import Gate通過後の最終Canonical Fact。

## 7. Durable Artifact Classes

A. Data-Bearing Working Snapshot
B. Research / Audit Evidence Pack
C. Checkpoint
D. Manifest / Artifact Register
E. Canonical Export

## 8. Preservation PASS Criteria

重要な監査Blockは以下を満たして初めてPreservation PASS。

- Approved実データがチャット外に存在する
- row / record countを確認できる
- Approval済み値と保存値が一致する
- 0件対象もLIVE_PROGRESS等で明示される
- Unknown / Partial / Rejected / Needs Reviewが消失していない
- Source / Evidenceへ戻れる
- Artifact Registerから場所を特定できる
- Notion / Project ControlからArtifactへ辿れる
- Readback済み

Checkpoint要約だけではPASSしない。

## 9. HHA PERFORMANCES Immediate Rule

LIV-0001〜LIV-0348 First-Pass:
- Accepted: 4,868
- Open Needs Review: 9
- DB write: NONE
- PRF Permanent ID: NOT FIXED

Cross-Audit前に4,868件のApproved row-level dataをDurable First-Pass Baselineへ固定する。

さらに今後のPERFORMANCES追加監査では、Approval BlockごとにApproved row-level resultをWorking Snapshotへ追記し、チャットだけに残さない。

## 10. Standard Flow

Work
→ Proposed Output
→ Approval
→ **Data-bearing save**
→ Readback / integrity check
→ Evidence Pack / Manifest
→ Notion Index
→ Project Control
→ Next Block / Chat close

## 11. Closure Rule

チャットを閉じる条件は「引継ぎ文書を書いた」ではない。

**そのチャットで新しく生成した再利用価値のある実データが、すべてチャット外から参照可能であること。**

この条件を満たさなければClosure GateはFAIL。

## 12. Change Control

本ContractはProject-level rule。
変更時はversionを上げ、旧versionを残す。
