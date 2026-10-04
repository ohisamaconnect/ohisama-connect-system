# ohisama-connect-system

『おひさまコネクト』の制作基盤 OC-OS と、その関連コード・Contract・検証記録を管理するリポジトリ。

## まず見るもの

- [OC-OS Component Registry v1.0](docs/OC-OS_COMPONENT_REGISTRY_v1.0.md) — **Current / Pilot / Support / Legacy / One-off の仕分け**
- [OC-OS Weekly Standard Operation v1.0](docs/OC-OS_WEEKLY_STANDARD_OPERATION_v1.0.md) — 毎週の標準運用
- [2026-10-04 Runtime Validation](docs/OC-OS_STANDARD_OPERATION_RUNTIME_VALIDATION_2026-10-04.md) — Core Production Runtime Confirmed の根拠
- [Active / Legacy Modules Registry](docs/OC-OS_ACTIVE_LEGACY_MODULES_v1.0.md) — 旧系統を再導入しないための記録

## 重要

`gas/` にある全ファイルが現行Productionではない。

構築時のPreview、Backfill、Cleanup、旧Crawler、Legacy moduleも履歴として残っているため、**Apps Scriptへフォルダ全体をコピーしないこと**。現行系はComponent RegistryとRuntime Validationを基準に判断する。

## 日常運用の中心

```text
Notion Current Week
  ↓
EPISODE / STUDIO ITEMS / INBOX
  ↓
水曜収録
  ↓
Drive EPISODE folder
  ↓
MASTER / TRANSCRIPT
  ↓
必要なSTATEMENTS / PUBLICATIONS
```

GitHubはコード・仕様・検証記録の保管場所であり、あさくらじゅんが毎週すべてのファイルを操作することを前提にしない。
