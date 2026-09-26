# OC-OS Episode Lifecycle Audit v1.0

基準日: 2026-09-26

## 1. 目的

EPISODEのProduction_Statusを自動で進めるのではなく、現在の制作状態を読み取り専用で一覧化する。

このAuditorは「収録できる／できない」を判定するゲートではない。

## 2. Canonical Principle

```text
システムがなくても水曜日には収録できる。
```

したがって、Auditorの不足項目は注意事項であり、収録禁止条件ではない。

## 3. Implementation

```text
gas/oc_os_episode_lifecycle_auditor_v0.1.0.gs
```

Main function:

```text
auditEpisodeLifecycleV01()
```

WRITEは一切行わない。

## 4. Target Episode

Script Property `OC_TARGET_EPISODE_KEY` があればそのEPISODEを監査する。

未設定時はRecording_Dateが現在日に最も近い対象EPISODEをPreview対象とする。

## 5. Audit Scope

### EPISODE Core

```text
Production_Status
Episode_Title
Studio_Pack_URL
Audio_URL
Transcript_URL
Structure_Memo
Setlist_Memo
```

### Relations

```text
Studio_Items
Events
Songs
Sources
Statements
Publications
```

### STUDIO ITEMS

```text
候補
使用済
保留
見送り
```

収録後も `候補` が残っている場合は注意を出すが、自動変更しない。

### STATEMENTS

```text
候補
確定
見送り
```

候補が残っていれば人間確認事項として表示する。

### PUBLICATIONS

```text
未着手
下書き
確認待ち
公開準備済
公開済
見送り
```

未完了Publicationが存在しても、放送本体の完了を妨げる必須条件とはみなさない。

## 6. Post-Recording Attention

Production_Statusが `収録済` 以降の場合、以下を確認する。

```text
Audio_URL
Transcript_URL
Structure_Memo
Setlist_Memo
Studio_Status=候補 の残存
STATEMENTS候補
PUBLICATIONS未完了
```

不足は「注意事項」として出力するだけである。

## 7. Production_Status Rule

AuditorはProduction_Statusを変更しない。

Status変更は人間判断とする。

```text
準備中
→ 収録準備済
→ 収録済
→ 放送済
→ アーカイブ処理済
→ 完了
```

この並びは制作状態の記録であり、機械的な必須チェックリストではない。

## 8. Separation of Concerns

放送本体:

```text
EPISODE / STUDIO ITEMS / Audio / Transcript / Actuals
```

主観アーカイブ:

```text
STATEMENTS
```

二次公開:

```text
PUBLICATIONS
```

PUBLICATIONSの未完了を理由に、水曜収録・放送本体・アーカイブ記録を止めない。

## 9. Initial Pilot

2026-10-04回でPost-Recording Integration実地検証時に、同じ `OC_TARGET_EPISODE_KEY = 2026-10-04` を使ってLifecycle Auditも実行する。

Auditor結果と実際の人間判断が一致するか確認し、必要なら注意項目のみ調整する。

## 10. Final Rule

Auditorは「管理者」ではなく「見落とし防止の計器」である。

制作を支配せず、あさくらじゅんが現在地を短時間で把握するために存在する。
