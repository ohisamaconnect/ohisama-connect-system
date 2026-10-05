# HHA Member Maintenance Contract v0.1

基準日: 2026-10-05

Status: **CURRENT / PILOT IMPLEMENTED — NOT DEPLOYED**

## 1. 目的

HHA MEMBERSを、日向坂46公式サイトの現行情報と定期的に照合し、

- 在籍者構成の変化
- 加入・卒業等につながり得る差分
- 公式プロフィール値の変化
- Canonical MEMBERS内部の不整合

を機械的に検知する。

この機能は **Canonicalを自動更新するためのものではない**。

```text
公式Sourceを観測
↓
差分検知
↓
Candidate / Review
↓
原典確認
↓
あさくらじゅんがCanonical判断
```

を維持する。

HHAは客観的Canonical知識基盤であり、このMaintenanceはOC-OSの番組制作判断とは分離する。

---

## 2. 上位原則

このContractはProject Canonical Principlesに従う。

特に次を変更しない。

- 最終判断はあさくらじゅんが行う
- 機械は収集・整理・候補提示まで
- Canonical確定は人間判断
- Source-First
- 一次情報優先
- 分からないものを無理に確定しない
- 永久Member_IDは変更しない

---

## 3. Canonical側

Canonical masterはNotion `HHA MEMBERS`。

Data Source ID:

```text
df86e0ba-5478-4fc6-b30a-49cb1bd6c83d
```

現行Schemaのうち、Maintenanceで主に参照するProperty:

```text
Member_ID
Member_Name
Member_Order
Generation
Activity_Status
Membership_Start_Date
Membership_End_Date
Official_Member_ID
Official_Profile_URL
Official_Blog_URL
Name_Kana
Romanized_Name
Birthday
Height_cm
Hometown
Blood_Type
Verification_Status
Last_Verified_At
Data_Note
```

v0.1ではCanonicalへの自動WRITEを行わない。

特に以下は自動変更禁止:

```text
Activity_Status
Membership_End_Date
Member_ID
Member_Order
Verification_Status
Last_Verified_At
```

---

## 4. Official Source

### 4.1 Roster

日向坂46公式メンバー一覧:

```text
https://www.hinatazaka46.com/s/official/search/artist?ima=0000
```

ここから現行公式ページに表示される

```text
Official_Member_ID
Member_Name
Name_Kana
Official_Profile_URL
```

を観測する。

ただし、**公式Rosterへの掲載はActivity_Statusの権威そのものではない。**

卒業・活動終了後もしばらく公式RosterやProfileが残存する場合がある。そのため、Rosterに表示されている人物が既存HHA MEMBERSで `卒業` / `活動辞退` 等としてCanonical確定済みなら、それだけを理由に在籍中へ戻したり `NEW_OFFICIAL_MEMBER` と判定したりしない。

また公式Roster HTMLでは、同一人物がALL・期別・誕生日・血液型等の複数セクションに繰り返し現れるため、観測人数は **Official_Member_ID単位で重複排除**して扱う。

### 4.2 Profile

各メンバー公式プロフィール:

```text
https://www.hinatazaka46.com/s/official/artist/<Official_Member_ID>?ima=0000
```

v0.1で比較する値:

```text
Member_Name
Name_Kana
Romanized_Name
Birthday
Height_cm
Hometown
Blood_Type
Official_Profile_URL
Official_Member_ID
```

### 4.3 Profile比較の正規化ルール

`Name_Kana` は、公式Sourceがひらがな、HHA Canonicalがカタカナで保持されている場合があるため、比較時のみひらがな／カタカナ差を吸収する。
Canonicalの保存表記そのものは、この正規化を理由に自動変更しない。

`Romanized_Name` は **公式プロフィールの綴りに準拠**する。
ただし大文字・小文字のみの差は意味差として扱わない。

HHA Canonicalでは可読性のためTitle Caseで保持し、比較時はNFKC・空白正規化・case-insensitiveで照合する。

したがって、

```text
Miku Kanemura
MIKU KANEMURA
```

は同一として扱う。

一方、

```text
Marii Morimoto
MARIE MORIMOTO

Niina Sakai
NINA SAKAI
```

のような綴りそのものの差は `PROFILE_ROMANIZED_NAME_DIFF` としてReview Candidateにする。
`Penlight_Color_1 / Penlight_Color_2` は現行プロフィールページの標準項目ではないため、v0.1 Profile Watchの比較対象にしない。

Instagram / X等のSNSも、公式ページ上の表現や有無が一定しないため、初期Pilotでは差分判定対象から外す。

---

## 5. 既存Raw Snapshot資産

Google Driveには既存資産として

```text
HHA_Member_Watcher/
└─ Raw_Snapshots/
   └─ 2026/
      └─ 2026-09/
```

が存在する。

2026-09-23の

```text
roster_YYYYMMDD_HHMMSS_<hash>.html
MEM-xxx_YYYYMMDD_HHMMSS_<hash>.html
```

形式の公式HTML Snapshotが残っている。

旧Trigger / 旧実装本体はCurrentとして復活させないが、このRaw Snapshot群はSource evidenceとして継承する。

新CurrentでもSnapshot命名互換を維持することを基本とする。

Snapshotはappend-only evidenceとして扱い、Canonicalそのものとはしない。

---

## 6. Maintenanceの3責務

### A. Roster Watch

公式RosterとHHA MEMBERS全Canonicalを照合し、その上で在籍中集合との差分を確認する。

Review Candidate:

```text
NEW_OFFICIAL_MEMBER
ACTIVE_MISSING_FROM_OFFICIAL_ROSTER
OFFICIAL_MEMBER_ID_MISMATCH
OFFICIAL_PROFILE_URL_MISMATCH
OFFICIAL_NAME_MISMATCH
ROSTER_FETCH_ERROR
ROSTER_PARSE_ERROR
```

Informational Observation:

```text
NONCURRENT_CANONICAL_STILL_VISIBLE_ON_OFFICIAL_ROSTER
```

これは、HHAで既に非在籍Canonicalとなっている既知人物が公式Rosterに残存している状態を記録するためのObservationである。

**これは新規加入Candidateでも、Activity_Status反転Candidateでもない。**

`ACTIVE_MISSING_FROM_OFFICIAL_ROSTER` も卒業確定を意味しない。

公式サイト更新途中、表示障害、HTML変更等があり得るため、Activity_StatusやMembership_End_Dateは自動更新しない。

### B. Profile Watch

公式在籍者のプロフィールを取得し、Canonical値との差分を検知する。

検知候補:

```text
PROFILE_BIRTHDAY_DIFF
PROFILE_HEIGHT_DIFF
PROFILE_HOMETOWN_DIFF
PROFILE_BLOOD_TYPE_DIFF
PROFILE_KANA_DIFF
PROFILE_ROMANIZED_NAME_DIFF
PROFILE_NAME_DIFF
PROFILE_FETCH_ERROR
PROFILE_PARSE_ERROR
```

高さ等の変更可能な値は、差分を「誤り」と決めつけず、公式時点値の変化候補として扱う。

### C. Canonical Integrity Audit

外部Sourceとは別に、HHA MEMBERS内部の構造を監査する。

例:

```text
Member_ID重複
Member_Order重複
Official_Member_ID重複
在籍中なのにOfficial_Profile_URL空欄
在籍中なのにOfficial_Member_ID空欄
Verification_Status / Last_Verified_Atの欠落
不正なMember_ID形式
```

このAuditもWRITE=NONEとする。

---

## 7. ObservationとCandidateを分ける

1回の取得結果だけでCanonical変更候補を強く断定しない。

```text
OBSERVED_DIFF
↓
同一差分が次回成功取得でも継続
↓
STABLE_DIFF
↓
Human Review
```

を基本とする。

ただし `NEW_OFFICIAL_MEMBER` のように公式Rosterへ明示的に新規掲載され、HHA全Canonicalにも一致しないケースは、1回目からReview対象として提示してよい。

一方、既に卒業等で非在籍Canonicalとなっている人物がRosterへ残存しているだけなら、`NONCURRENT_CANONICAL_STILL_VISIBLE_ON_OFFICIAL_ROSTER` として情報記録に留める。

いずれの場合も自動Canonical WRITEはしない。

---

## 8. Raw Snapshot方針

Source取得に成功した場合、必要に応じてRaw HTMLを保存できる設計とする。

推奨命名:

```text
roster_YYYYMMDD_HHMMSS_<sha12>.html
MEM-xxx_YYYYMMDD_HHMMSS_<sha12>.html
```

保存先は既存 `HHA_Member_Watcher/Raw_Snapshots` を継承する。

同一HTML hashのSnapshotを毎回重複保存する必要はない。

保存したSnapshotは、

- 取得日時
- Source URL
- SHA-256
- 対象Member_ID

を追跡できるようにする。

---

## 9. Pilot段階の安全条件

初期実装は以下を必須とする。

```text
AUTO_TRIGGER = false
NOTION_WRITE = false
CANONICAL_AUTO_UPDATE = false
```

最初に実行するのはPreviewのみ。

Pilotでは最低限、次を確認する。

1. HHA MEMBERSの全Canonical rowを正しく読める
2. 公式Rosterを正しく抽出できる
3. Roster HTML内の同一人物重複をOfficial_Member_ID単位で除去できる
4. 卒業等の非在籍CanonicalがRosterに残っていても新規加入と誤判定しない
5. Official_Member_IDで安全に照合できる
6. 現行在籍者のプロフィールを取得できる
7. Birthday / Height / Hometown / Blood_Type等を正規化できる
8. 差分なしを差分ありと誤判定しない
9. HTML構造変更時に「値が空になった」ことをCanonical差分と誤認せずPARSE_ERRORにできる
10. 既存Raw Snapshot構造を壊さない
11. HHA MEMBERSへ一切自動WRITEしない

---

## 10. Trigger方針

Pilot完了前はTriggerを作成しない。

Pilot完了後の候補:

```text
Roster Watch   : DAILY
Profile Watch  : WEEKLY
Canonical Audit: WEEKLY
```

Rosterは加入・卒業等の構成変化を早く検知するため日次。

プロフィール値は日次で確認する必要性が低いため週次を基本とする。

正確な実行曜日・時刻はProduction昇格時に決める。

---

## 11. Runtime昇格手順

現在のApps Script Production Runtimeは、2026-10-05時点で9 Current familyへ整理済みである。

この状態を崩さないため、HHA Member Maintenanceは次の順で進める。

```text
1. Contract確定
2. gas/ にPreview-only Pilot実装
3. 静的構文監査
4. 手動Preview
5. 実公式SourceでParser検証
6. 差分判定監査
7. Raw Snapshot保存Pilot
8. CURRENT / PILOTとしてRuntime昇格判断
9. apps-script/runtime/HHA_Member_Maintenance_Current.gs を生成
10. tools/audit_apps_script_runtime.ps1 更新
11. Diagnostics Runtime inventory更新
12. clasp push
13. Runtime Audit
14. Triggerを最後に導入
15. 継続運用成功後にCURRENT / PRODUCTION判定
```

2026-10-05時点の実装:

```text
gas/hha_member_maintenance_v0.1.2.gs
tools/audit_hha_member_maintenance_v0.1.ps1
```

v0.1.0はRoster重複・非在籍Canonical残存の扱いを改善するためv0.1.1へ置き換え、main branchから削除済み。Git履歴には残る。

### 2026-10-05 v0.1.2 Pilot検証結果

実公式Sourceを用いたStandalone Pilotで以下を確認した。

```text
Canonical Integrity
canonicalCount = 47
currentCount   = 26
issueCount     = 0

Official Roster
canonicalCurrentCount      = 26
officialVisibleUniqueCount = 26
candidateCount             = 0
errorCount                 = 0

Official Profile
targetCount      = 26
observationCount = 26
candidateCount   = 0
errorCount       = 0
```

`Name_Kana` はひらがな／カタカナ差を比較時のみ吸収することで、26件の偽陽性を解消した。

`Romanized_Name` では、森本茉莉の `Marii / MARIE`、坂井新奈の `Niina / NINA` をReviewし、公式綴りに基づきCanonicalをそれぞれ `Marie Morimoto`、`Nina Sakai` とした。

大文字・小文字まで完全一致させるv0.1.3実験では、既存24名にcapitalization-onlyの差分が発生した。
これは公式サイトの全大文字表示とHHAのTitle Caseという表示形式差であり、意味差ではないと判断した。

したがってv0.1.3はCurrentへ採用せず、v0.1.2のcase-insensitive Romanized比較をCanonical Ruleとして維持する。

v0.1.2はGit commit `5c8b575` でmain branchへ固定済み。
Runtimeへ置かれたこととProduction運用成功は別状態として扱う。

---

## 12. 非目標

v0.1では以下を行わない。

- 卒業日の自動決定
- Membership_End_Dateの自動入力
- 新Member_IDの自動採番・確定
- HHA HISTORY EVENTSの自動Canonical生成
- Penlight Colorの自動確定
- SNS URLの自動確定
- Canonical MEMBERSへの無人更新
- 番組で扱うかどうかの判断

加入・卒業等が検知された場合、HHA HISTORY EVENTSとの接続はHuman Review後の別工程とする。

---

## 13. v0.1の完成条件

次を満たした時点でMember Maintenance v0.1の初期構築を完成とする。

```text
公式Roster差分を検知できる
+
公式Profile差分を検知できる
+
HHA内部整合性を監査できる
+
Raw Sourceを再検証可能な形で保存できる
+
Canonicalへ勝手に書かない
+
定期実行しても重複・誤更新を生まない
```

完成後もCanonical確定権限はあさくらじゅんに残る。
