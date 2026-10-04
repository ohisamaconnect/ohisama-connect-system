# OC-OS Apps Script Runtime Consolidation Policy v1.0

基準日: 2026-10-04

## 1. 目的

GitHub上の開発履歴と、実際に稼働させるGoogle Apps Script Production Runtimeを明確に分ける。

GitHubでは、v1.2.6 → v1.2.7 → v1.2.8 のような開発過程、Preview、Stage、Migration、旧版を履歴・監査証拠として保持してよい。

一方、Google Apps ScriptのProduction Runtimeでは、過去VersionをBaseとして何層も積み上げない。統合可能な世代依存は最新版へ統合し、Productionとして必要な現行機能だけで理解・保守できる状態を目標とする。

## 2. 原則

### GitHub

- 開発過程を残してよい。
- 旧Version、Preview、Stage、Migrationは履歴として参照可能にする。
- Git履歴そのものも過去版の保存手段とする。
- GitHub上に旧版が存在することと、Production Runtimeへ導入することを分ける。

### Apps Script Production Runtime

- 最新Productionが旧VersionのRunner/Baseを何層も必要とする構造は、統合可能なら解消する。
- `v1.2.8 -> v1.2.7 -> v1.2.6` のような**世代依存**を避ける。
- 同一現行Version内での責務分割は許容する。
  - 例: `crawler_core_v1.2.8` + `crawler_runtime_v1.2.8`
  - 例: `episode_actuals` + `post_recording_intake` + `post_recording_integrator`
- 分割の理由は「責務が異なるから」であり、「過去Versionを継承しているから」ではない状態にする。
- TriggerはProduction entry pointだけを参照する。
- Preview / Migration / One-offのentry pointをProduction Runtimeへ常設しない。

## 3. 統合すべき依存と、残してよい依存

### A. 統合対象: 世代依存

#### INBOX Crawler

現状:

```text
v1.2.8 revision-chain production runner
    -> v1.2.7 stable-source/revision logic
        -> v1.2.6 collectors / normalize / Notion / Ledger
```

Production Runtimeの目標:

```text
Crawler Production v1.2.8
    ├─ Core v1.2.8
    └─ Runtime v1.2.8
```

または安全に自己完結できる場合:

```text
Crawler Production v1.2.8 (single integrated module)
```

v1.2.6 / v1.2.7はGitHub上では履歴として保持してよいが、Production Runtimeの必須依存にはしない。

#### INBOX Processor

現状:

```text
ready-only v0.1.2
    -> revision guard v0.1.1
        -> processor base v0.1.0
```

Production Runtimeの目標:

```text
Processor Production v0.1.2
    ├─ Core v0.1.2
    └─ Runtime v0.1.2
```

または安全に自己完結できる場合:

```text
Processor Production v0.1.2 (single integrated module)
```

v0.1.0 / v0.1.1はGitHub履歴として残してよいが、Production Runtimeの必須依存にはしない。

### B. 原則として統合しない: 現行責務依存

`oc_os_post_recording_integrator_v0.1.0.gs` が、Episode Actuals / Post Recording Intake / Transcript Materializer等の現行モジュールを呼ぶ構造は、世代継承ではなく責務分割である。

この種の依存は、各モジュールが独立した責務とContractを持ち、同一現行設計として管理されている限り、無理に一枚の巨大Scriptへ統合しない。

## 4. 統合判断基準

以下をすべて満たす場合、最新版への統合を行う。

1. 旧Version側の関数が現行最新版のためだけに残っている。
2. 他のProductionモジュールが旧Version側を独立して必要としていない。
3. 統合してもTrigger名・Script Properties・Notion/Drive ID・外部API動作を維持できる。
4. Human-owned Decision等の安全境界を変えない。
5. PreviewでWRITE=NONEの同等性を確認できる。
6. 統合後のProduction runで実データ挙動を確認できる。
7. Rollback時はGitHub履歴から旧構成を復元できる。

## 5. 統合手順

```text
依存監査
  -> 現行機能抽出
  -> 最新Version名前空間へ統合
  -> 重複/旧entry point除去
  -> WRITE=NONE Preview比較
  -> Trigger切替
  -> Production実行
  -> Runtime Audit
  -> 旧VersionをApps Script Runtimeから除去
```

旧VersionをApps Scriptから先に消さない。統合版のPreview・Production確認後に除去する。

## 6. 2026-10-04時点の優先順位

1. **INBOX Crawler** — v1.2.8 / v1.2.7 / v1.2.6 の世代依存を統合する。
2. **INBOX Processor** — v0.1.2 / v0.1.1 / v0.1.0 の世代依存を統合する。
3. Suggestion系 — 現行Production/Pilotとして残るものを確定後、同じ原則で監査する。
4. Weekly / Post Recording系 — 世代依存ではなく責務分割かを確認し、不要な巨大統合はしない。

## 7. 重要な区別

```text
GitHubに残す
    ≠
Apps Scriptに残す

複数ファイル
    ≠
悪い依存

旧VersionをBaseにする
    ≠
望ましいモジュール分割
```

Production Runtimeは、**現在の設計だけを見れば理解できる状態**を完成条件とする。
